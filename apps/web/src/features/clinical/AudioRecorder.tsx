import { useEffect, useRef, useState } from "react";
export function AudioRecorder({
  onRecorded,
  onRecording,
  disabled = false,
}: {
  onRecorded: (file: File, seconds: number) => void;
  onRecording: (recording: boolean) => void;
  disabled?: boolean;
}) {
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    starting = useRef(false),
    timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false),
    [requesting, setRequesting] = useState(false),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearInterval(timer.current);
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state !== "inactive") recorder.current.stop();
      }
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  async function start() {
    if (disabled || starting.current || recorder.current?.state === "recording")
      return;
    starting.current = true;
    setRequesting(true);
    onRecording(true);
    setError("");
    try {
      if (
        typeof MediaRecorder === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      )
        throw new Error(
          "Este navegador não permite gravar áudio. Use um navegador com acesso ao microfone.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!mounted.current) {
        stream.current.getTracks().forEach((track) => track.stop());
        return;
      }
      const mime = ["audio/webm", "audio/ogg", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!mime)
        throw new Error("Não há formato de áudio compatível neste navegador.");
      const instance = new MediaRecorder(stream.current, {
        mimeType: mime,
        audioBitsPerSecond: 32000,
      });
      recorder.current = instance;
      const chunks: BlobPart[] = [];
      const started = Date.now();
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
        if (Date.now() - started >= 900000 && instance.state !== "inactive")
          instance.stop();
      };
      instance.onstop = () => {
        if (timer.current) clearInterval(timer.current);
        stream.current?.getTracks().forEach((track) => track.stop());
        const duration = Math.max(1, Math.floor((Date.now() - started) / 1000));
        if (duration > 900) {
          setError(
            "A gravação ultrapassou 15 minutos. Grave novamente dentro do limite.",
          );
        } else
          onRecorded(
            new File(
              chunks,
              `audio-${Date.now()}.${mime === "audio/ogg" ? "ogg" : mime === "audio/mp4" ? "m4a" : "webm"}`,
              { type: mime },
            ),
            duration,
          );
        setRecording(false);
        onRecording(false);
      };
      instance.start(1000);
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 900 && instance.state !== "inactive") instance.stop();
      }, 1000);
    } catch (cause) {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (mounted.current) {
        setError((cause as Error).message);
        onRecording(false);
      }
    } finally {
      starting.current = false;
      if (mounted.current) setRequesting(false);
    }
  }
  return (
    <div className="audio-recorder">
      {error && <p className="form-error">{error}</p>}
      {recording ? (
        <>
          <p role="status">
            Gravando: {Math.floor(seconds / 60)}:
            {String(seconds % 60).padStart(2, "0")} · limite de 15 minutos
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => recorder.current?.stop()}
          >
            Concluir gravação
          </button>
        </>
      ) : (
        <button
          type="button"
          className="secondary-button"
          disabled={requesting || disabled}
          onClick={() => void start()}
        >
          {requesting ? "Aguardando microfone…" : "Gravar áudio"}
        </button>
      )}
    </div>
  );
}
