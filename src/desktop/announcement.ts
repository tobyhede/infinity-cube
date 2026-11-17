import { z } from 'zod';

/**
 * The one line the desktop sidecar writes to standard output (ADR 0155), which
 * the desktop shell reads to find its window's address or why there is none.
 */
export const sidecarAnnouncementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('listening'),
    port: z.number().int().min(1).max(65_535),
    secret: z.string().min(1),
  }),
  z.object({ kind: z.literal('refused'), message: z.string() }),
]);

export type SidecarAnnouncement = z.infer<typeof sidecarAnnouncementSchema>;
