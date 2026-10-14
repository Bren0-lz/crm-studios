import { z } from "zod";
import {
  professionalInputSchema,
  roomInputSchema,
  serviceInputSchema,
} from "./model.js";
import type { Professional, Room, Service } from "./types.js";
export const administrativeRegistryInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("professional"),
    data: professionalInputSchema.extend({ active: z.boolean() }),
  }),
  z.object({
    kind: z.literal("room"),
    data: roomInputSchema.extend({ active: z.boolean() }),
  }),
  z.object({
    kind: z.literal("service"),
    data: serviceInputSchema.extend({ active: z.boolean() }),
  }),
]);
export type AdministrativeRegistryInput = z.infer<
  typeof administrativeRegistryInputSchema
>;
export interface AdministrativeRegistryWorkspace {
  professionals: Professional[];
  rooms: Room[];
  services: Service[];
}
