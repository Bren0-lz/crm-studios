import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Patient } from "@crm/contracts";
import { parseCsv, readXlsxRows, validatePatientImport } from "./patient-import.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

function existingPatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clinicId,
    recordNumber: "000001",
    status: "active",
    fullName: "Maria Existente",
    cpf: "123.456.789-09",
    phone: "11988887777",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseCsv", () => {
  it("lê CSV separado por ponto e vírgula com BOM, aspas e CRLF", () => {
    const text = '﻿Nome;Telefone;Observações\r\n"Ana; da Silva";(11) 99999-0000;"Disse ""oi""\nem duas linhas"\r\n';
    expect(parseCsv(text)).toEqual([
      ["Nome", "Telefone", "Observações"],
      ["Ana; da Silva", "(11) 99999-0000", 'Disse "oi"\nem duas linhas'],
    ]);
  });

  it("detecta vírgula como separador", () => {
    expect(parseCsv('nome,telefone,etiquetas\nBeto Souza,11999990000,"pilates, vip"')).toEqual([
      ["nome", "telefone", "etiquetas"],
      ["Beto Souza", "11999990000", "pilates, vip"],
    ]);
  });

  it("devolve lista vazia para texto vazio", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("﻿")).toEqual([]);
  });
});

describe("readXlsxRows", () => {
  it("lê a primeira aba de um XLSX gerado em memória", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Clientes");
    workbook.addWorksheet("Outra").addRow(["ignorar"]);
    sheet.addRow(["Nome completo", "Celular", "Data de nascimento", "E-mail", "Tags"]);
    sheet.addRow([
      "Carla Mendes",
      11977776666,
      new Date(Date.UTC(1990, 4, 20)),
      { text: "carla@example.com", hyperlink: "mailto:carla@example.com" },
      "pilates",
    ]);
    sheet.addRow([]);
    sheet.addRow(["Davi Lima", "(21) 3333-4444", "05/06/1985", null, null]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const rows = await readXlsxRows(buffer);
    expect(rows[0]).toEqual(["Nome completo", "Celular", "Data de nascimento", "E-mail", "Tags"]);
    expect(rows[1]).toEqual(["Carla Mendes", "11977776666", "1990-05-20", "carla@example.com", "pilates"]);
    expect(rows[2]?.every((cell) => cell === "")).toBe(true);
    expect(rows[3]?.slice(0, 3)).toEqual(["Davi Lima", "(21) 3333-4444", "05/06/1985"]);

    const analysis = validatePatientImport(rows, []);
    expect(analysis.errors).toEqual([]);
    expect(analysis.rows.map((row) => [row.line, row.status])).toEqual([
      [2, "valid"],
      [4, "valid"],
    ]);
    expect(analysis.rows[0]?.input).toMatchObject({
      fullName: "Carla Mendes",
      phone: "11977776666",
      birthDate: "1990-05-20",
      email: "carla@example.com",
      tags: ["pilates"],
    });
    expect(analysis.rows[1]?.input).toMatchObject({ phone: "2133334444", birthDate: "1985-06-05" });
  });
});

describe("validatePatientImport", () => {
  it("reconhece cabeçalhos sem diferenciar maiúsculas e acentos e monta a entrada", () => {
    const analysis = validatePatientImport(
      [
        ["NOME", "CPF", "Telefone", "WhatsApp", "Email", "Nascimento", "Etiquetas", "OBSERVAÇÕES", "Coluna extra"],
        [" Ana Paula ", "987.654.321-00", "(11) 99999-0000", "11 99999-0001", "ana@example.com", "31/12/1980", "pilates, vip , ", "Prefere manhã", "x"],
        ["Bruno Alves", "", "1133334444", "", "", "1979-02-03", "", "", ""],
      ],
      [],
    );
    expect(analysis.errors).toEqual([]);
    expect(analysis.totals).toEqual({ valid: 2, error: 0, duplicate: 0 });
    expect(analysis.rows[0]).toEqual({
      line: 2,
      status: "valid",
      fullName: "Ana Paula",
      phone: "(11) 99999-0000",
      input: {
        fullName: "Ana Paula",
        cpf: "987.654.321-00",
        phone: "11999990000",
        whatsapp: "11999990001",
        email: "ana@example.com",
        birthDate: "1980-12-31",
        tags: ["pilates", "vip"],
        notes: "Prefere manhã",
      },
    });
    expect(analysis.rows[1]?.input).toEqual({
      fullName: "Bruno Alves",
      phone: "1133334444",
      birthDate: "1979-02-03",
      tags: [],
    });
  });

  it("aceita sinônimos de cabeçalho com acentos", () => {
    const analysis = validatePatientImport(
      [
        ["Nome do cliente", "Celular", "Data de Nascimento", "E-mail", "Tags", "Obs"],
        ["Célia Rocha", "11988880000", "01/02/2000", "celia@example.com", "dança", "nota"],
      ],
      [],
    );
    expect(analysis.errors).toEqual([]);
    expect(analysis.rows[0]?.status).toBe("valid");
    expect(analysis.rows[0]?.input).toMatchObject({
      birthDate: "2000-02-01",
      email: "celia@example.com",
      tags: ["dança"],
      notes: "nota",
    });
  });

  it("gera erro geral quando falta nome ou telefone no cabeçalho", () => {
    const semTelefone = validatePatientImport([["Nome", "Email"], ["Ana Paula", "a@b.com"]], []);
    expect(semTelefone.rows).toEqual([]);
    expect(semTelefone.errors).toEqual([expect.stringMatching(/telefone/i)]);

    const semNome = validatePatientImport([["Celular"], ["11999990000"]], []);
    expect(semNome.errors).toEqual([expect.stringMatching(/nome/i)]);

    const vazio = validatePatientImport([], []);
    expect(vazio.errors).toHaveLength(1);
  });

  it("aponta erros por linha em pt-BR e ignora linhas vazias", () => {
    const analysis = validatePatientImport(
      [
        ["Nome", "Telefone", "Email", "Nascimento", "WhatsApp"],
        ["Al", "99999", "sem-arroba", "31/02/1990", "123"],
        ["", "", "", "", ""],
        ["Carlos Dias", "", "", "", ""],
        ["Diana Luz", "11999990000", "", "1990/01/01", ""],
      ],
      [],
    );
    expect(analysis.totals).toEqual({ valid: 0, error: 3, duplicate: 0 });
    const [first, second, third] = analysis.rows;
    expect(first?.line).toBe(2);
    expect(first?.status).toBe("error");
    expect(first?.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Linha 2: nome/),
        "Linha 2: telefone deve ter DDD (10 ou 11 dígitos).",
        expect.stringMatching(/^Linha 2: e-mail/),
        expect.stringMatching(/^Linha 2: data de nascimento/),
        expect.stringMatching(/^Linha 2: WhatsApp/),
      ]),
    );
    expect(second?.line).toBe(4);
    expect(second?.errors).toEqual(["Linha 4: telefone é obrigatório."]);
    expect(third?.errors).toEqual([expect.stringMatching(/^Linha 5: data de nascimento/)]);
    expect(first?.input).toBeUndefined();
  });

  it("marca duplicados por CPF ou telefone contra a base e dentro do arquivo", () => {
    const existing = existingPatient();
    const analysis = validatePatientImport(
      [
        ["Nome", "CPF", "Telefone"],
        ["Maria Nova", "12345678909", "11911112222"],
        ["Outra Pessoa", "", "(11) 98888-7777"],
        ["Pedro Primeiro", "111.222.333-44", "11922223333"],
        ["Pedro Segundo", "", "11 92222-3333"],
        ["Pedro Terceiro", "11122233344", "11944445555"],
        ["Pessoa Única", "", "11955556666"],
      ],
      [existing],
    );
    expect(analysis.totals).toEqual({ valid: 2, error: 0, duplicate: 4 });
    expect(analysis.rows.map((row) => row.status)).toEqual([
      "duplicate",
      "duplicate",
      "valid",
      "duplicate",
      "duplicate",
      "valid",
    ]);
    expect(analysis.rows[0]?.duplicateOf).toEqual({
      kind: "existing",
      field: "cpf",
      patientId: existing.id,
      fullName: existing.fullName,
    });
    expect(analysis.rows[1]?.duplicateOf).toEqual({
      kind: "existing",
      field: "phone",
      patientId: existing.id,
      fullName: existing.fullName,
    });
    expect(analysis.rows[3]?.duplicateOf).toEqual({ kind: "row", field: "phone", line: 4 });
    expect(analysis.rows[4]?.duplicateOf).toEqual({ kind: "row", field: "cpf", line: 4 });
    expect(analysis.rows[3]?.input?.fullName).toBe("Pedro Segundo");
  });
});
