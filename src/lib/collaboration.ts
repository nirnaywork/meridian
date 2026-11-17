import { z } from "zod";

export const projectStatuses = [
  "open",
  "closed",
  "in_progress",
  "completed",
  "cancelled",
  "archived",
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const transitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
  open: ["closed", "in_progress", "completed", "cancelled"],
  closed: ["open", "in_progress", "completed", "cancelled"],
  in_progress: ["open", "closed", "completed", "cancelled"],
  completed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};
export const statusLabel = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const canTransition = (from: ProjectStatus, to: ProjectStatus) =>
  transitions[from]?.includes(to) ?? false;
export const isReadOnly = (status: string) =>
  ["completed", "cancelled", "archived"].includes(status);
export const messageSchema = z
  .string()
  .trim()
  .min(1, "Write a message")
  .max(2000);
export const ticketTypes = [
  "Issue",
  "Feature",
  "Modification",
  "Improvement",
  "Question",
] as const;
export const ticketStatuses = [
  "open",
  "in_progress",
  "resolved",
  "closed",
] as const;
export const priorities = ["low", "medium", "high"] as const;
export const nextTicketStatuses: Record<
  (typeof ticketStatuses)[number],
  readonly (typeof ticketStatuses)[number][]
> = {
  open: ["in_progress"],
  in_progress: ["resolved"],
  resolved: ["closed", "open"],
  closed: ["open"],
};
const recipients = z.array(z.string().uuid()).max(100).optional();
const updateBody = z.string().trim().min(1).max(4000);
export function normalizeLink(input: string, platform?: "github" | "linkedin") {
  const value = input.trim();
  if (!value) return "";
  if (value.length > 2048 || /^(?!https:)[a-z][a-z\d+.-]*:/i.test(value))
    throw new Error("Use an https URL");
  const url = new URL(/^https:\/\//i.test(value) ? value : `https://${value}`);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".local")
  )
    throw new Error("Use a public https URL without credentials");
  if (
    platform &&
    !new Set([`${platform}.com`, `www.${platform}.com`]).has(url.hostname)
  )
    throw new Error(`Use a ${platform}.com URL`);
  return url.href;
}
const link = (platform?: "github" | "linkedin") =>
  z
    .string()
    .max(2048)
    .transform((v, ctx) => {
      try {
        return normalizeLink(v, platform);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
        return z.NEVER;
      }
    });
export const profileMetadataSchema = z.object({
  github: link("github").default(""),
  linkedin: link("linkedin").default(""),
  website: link().default(""),
  custom: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        url: link().refine(Boolean, "Enter a URL"),
      }),
    )
    .max(3)
    .default([]),
  visibility: z.enum(["private", "public"]).default("private"),
});
export type ProfileMetadata = z.infer<typeof profileMetadataSchema>;
export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
};
export const shouldNotify = (recipient: string | null, actor: string | null) =>
  Boolean(recipient && recipient !== actor);
export const publicProfileColumns =
  "id,display_name,headline,bio,university,interests,domains,avatar_url,is_member,is_team_lead,links,visibility";
export const workspaceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(projectStatuses) }),
  z.object({
    action: z.enum(["leave", "remove"]),
    user_id: z.string().uuid().optional(),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({
    action: z.literal("reassign"),
    user_id: z.string().uuid(),
    role_id: z.string().uuid().nullable(),
  }),
  z.object({ action: z.literal("transfer"), user_id: z.string().uuid() }),
  z.object({
    action: z.literal("transfer_reply"),
    id: z.string().uuid(),
    accept: z.boolean(),
  }),
  z.object({
    action: z.literal("message"),
    id: z.string().uuid(),
    body: messageSchema,
    recipients,
  }),
  z.object({
    action: z.enum(["edit_message", "delete_message"]),
    id: z.string().uuid(),
    body: messageSchema.optional(),
  }),
  z.object({
    action: z.literal("read_chat"),
    recipients,
    seen_at: z.string().datetime({ offset: true }),
  }),
  z.object({
    action: z.enum(["post_update", "edit_update"]),
    id: z.string().uuid(),
    body: updateBody,
  }),
  z.object({ action: z.literal("delete_update"), id: z.string().uuid() }),
  z.object({
    action: z.literal("ticket"),
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    description: updateBody,
    type: z.enum(ticketTypes),
    priority: z.enum(priorities),
    assignee_id: z.string().uuid().nullable(),
  }),
  z.object({
    action: z.literal("ticket_status"),
    id: z.string().uuid(),
    status: z.enum(ticketStatuses),
  }),
]);
