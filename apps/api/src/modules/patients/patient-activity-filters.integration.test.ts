import { nextTestCpf } from "../../test-support/cpf.js";
import { describe, expect, it, vi } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";
import { reissuedHeaders } from "../../test-support/clock.js";

describe("patient activity filters", () => {
  it("summarizes services, professionals and visits and filters the list and export by them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2032-02-01T12:00:00.000Z"));
      const { app, token } = await authenticatedApp();
      let headers = { authorization: `Bearer ${token}` };
      const create = async (fullName: string) => {
        const response = await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: { cpf: nextTestCpf(), fullName, phone: "11955550000" },
        });
        expect(response.statusCode).toBe(201);
        return response.json() as { id: string };
      };
      const ana = await create("Ana Atividade");
      const bruno = await create("Bruno Atividade");
      const carla = await create("Carla Atividade");
      const [professionals, rooms, services] = await Promise.all(
        ["/professionals", "/rooms", "/services"].map(
          async (url) =>
            (await app.inject({ method: "GET", url, headers })).json() as {
              id: string;
              name?: string;
              fullName?: string;
            }[],
        ),
      );
      const schedule = async (patientId: string, startsAt: string) => {
        const response = await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload: {
            patientId,
            professionalId: professionals![0]!.id,
            roomId: rooms![0]!.id,
            serviceId: services![0]!.id,
            startsAt,
          },
        });
        expect(response.statusCode).toBe(201);
        return response.json() as {
          id: string;
          serviceName: string;
          professionalName: string;
        };
      };
      // Ana foi atendida há mais de 30 dias; Bruno tem horário marcado; Carla, nada.
      const past = await schedule(ana.id, "2032-02-02T13:00:00.000Z");
      vi.setSystemTime(new Date("2032-02-02T14:30:00.000Z"));
      headers = reissuedHeaders(app, headers);
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/appointments/${past.id}/status`,
            headers,
            payload: { status: "completed" },
          })
        ).statusCode,
      ).toBe(200);
      vi.setSystemTime(new Date("2032-03-15T12:00:00.000Z"));
      headers = reissuedHeaders(app, headers);
      const future = await schedule(bruno.id, "2032-03-22T13:00:00.000Z");

      const segments = (
        await app.inject({ method: "GET", url: "/patients/segments", headers })
      ).json() as {
        patientId: string;
        services?: string[];
        professionals?: string[];
        lastVisitOn?: string;
        nextAppointmentAt?: string;
      }[];
      const byId = (id: string) =>
        segments.find((item) => item.patientId === id);
      expect(byId(ana.id)).toMatchObject({
        services: [past.serviceName],
        professionals: [past.professionalName],
        lastVisitOn: "2032-02-02",
      });
      expect(byId(ana.id)?.nextAppointmentAt).toBeUndefined();
      expect(byId(bruno.id)).toMatchObject({
        nextAppointmentAt: "2032-03-22T13:00:00.000Z",
      });
      expect(byId(bruno.id)?.lastVisitOn).toBeUndefined();
      expect(byId(carla.id)).toMatchObject({ services: [], professionals: [] });

      const names = async (query: string) =>
        (
          (
            await app.inject({
              method: "GET",
              url: `/patients?search=Atividade&${query}`,
              headers,
            })
          ).json() as { fullName: string }[]
        )
          .map((item) => item.fullName)
          .sort();
      expect(await names("lastVisit=over_30")).toEqual(["Ana Atividade"]);
      expect(await names("lastVisit=last_30")).toEqual([]);
      expect(await names("lastVisit=never")).toEqual([
        "Bruno Atividade",
        "Carla Atividade",
      ]);
      expect(await names("nextAppointment=scheduled")).toEqual([
        "Bruno Atividade",
      ]);
      expect(await names("nextAppointment=none")).toEqual([
        "Ana Atividade",
        "Carla Atividade",
      ]);
      expect(
        await names(`service=${encodeURIComponent(future.serviceName)}`),
      ).toEqual(["Ana Atividade", "Bruno Atividade"]);
      expect(
        await names(
          `professional=${encodeURIComponent(future.professionalName)}&lastVisit=never`,
        ),
      ).toEqual(["Bruno Atividade"]);

      const exported = await app.inject({
        method: "GET",
        url: "/patients/export?format=csv&columns=fullName&search=Atividade&nextAppointment=none",
        headers,
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.body).toContain("Ana Atividade");
      expect(exported.body).toContain("Carla Atividade");
      expect(exported.body).not.toContain("Bruno Atividade");
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
