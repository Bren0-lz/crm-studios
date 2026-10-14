import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioRecorder } from "./AudioRecorder";

class TestRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  onstop: (() => void) | null = null;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"]) });
    this.onstop?.();
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("gravação clínica", () => {
  it("bloqueia novas solicitações enquanto aguarda o microfone e libera a captura ao desmontar", async () => {
    let resolve!: (value: MediaStream) => void;
    const permission = new Promise<MediaStream>((done) => {
      resolve = done;
    });
    const stop = vi.fn(),
      getUserMedia = vi.fn(() => permission),
      busy = vi.fn();
    vi.stubGlobal("MediaRecorder", TestRecorder);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const view = render(
      <AudioRecorder onRecorded={vi.fn()} onRecording={busy} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Gravar áudio" }));
    expect(
      screen.getByRole("button", { name: "Aguardando microfone…" }),
    ).toBeDisabled();
    expect(busy).toHaveBeenCalledWith(true);
    view.unmount();
    await act(async () => {
      resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
      await permission;
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalled();
  });
  it("encerra aos 15 minutos e rejeita uma captura atrasada sem reduzir artificialmente a duração", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2039-05-01T12:00:00Z"));
    const stop = vi.fn(),
      saved = vi.fn(),
      busy = vi.fn();
    vi.stubGlobal("MediaRecorder", TestRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })),
      },
    });
    render(<AudioRecorder onRecorded={saved} onRecording={busy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gravar áudio" }));
    });
    act(() => {
      vi.advanceTimersByTime(900000);
    });
    expect(saved).toHaveBeenCalledWith(expect.any(File), 900);
    expect(stop).toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gravar áudio" }));
    });
    vi.setSystemTime(new Date("2039-05-01T12:31:00Z"));
    fireEvent.click(screen.getByRole("button", { name: "Concluir gravação" }));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/A gravação ultrapassou 15 minutos/)).toBeVisible();
    expect(busy).toHaveBeenLastCalledWith(false);
  });
});
