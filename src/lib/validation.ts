import { z } from "zod";
import {projectStatuses} from "./collaboration";
export const requiredDomains=z.array(z.string().trim().min(1).max(100)).min(1,"Choose at least one domain").max(20);
export const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[0-9]/, "Add a number");
export const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const skill = z.object({
  name: z.string().trim().min(1).max(70),
  id: z.string().uuid().optional(),
  proficiency: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  importance: z.enum(["required", "preferred"]).optional(),
});
export const profileSchema = z
  .object({
    domains: z.array(z.string().max(100)).max(20).default([]),
    display_name: z.string().trim().min(1).max(80),
    headline: z.string().trim().min(3).max(140),
    bio: z.string().max(1500).default(""),
    university: z.string().max(120).default(""),
    interests: z.string().max(200).default(""),
    avatar_url: z.string().url().nullable().default(null),
    avatar_key: z.string().max(300).nullable().default(null),
    is_member: z.boolean(),
    is_team_lead: z.boolean(),
    onboarding_complete: z.boolean().default(true),
    revision: z.number().int().nonnegative(),
    skills: z
      .array(
        skill.extend({
          proficiency: z.enum(["beginner", "intermediate", "advanced"]),
        }),
      )
      .min(1)
      .max(40),
  })
  .refine((x) => x.is_member || x.is_team_lead, "Select at least one intent")
  .superRefine((p,ctx)=>{if((p.revision===0||!p.onboarding_complete)&&!requiredDomains.safeParse(p.domains).success)ctx.addIssue({code:z.ZodIssueCode.custom,path:['domains'],message:'Choose at least one domain'});});
export const projectSchema = z
  .object({
    id: z.string().uuid().optional(),
    revision: z.number().int().nonnegative().default(0),
    domains: z.array(z.string().max(100)).max(20).default([]),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(30).max(8000),
    category: z.string().trim().min(2).max(80),
    tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
    commitment: z.enum(["casual", "part-time", "intensive"]),
    duration: z.string().min(2).max(80),
    team_size: z.number().int().min(2).max(50),
    status: z.enum(projectStatuses).default("open"),
    roles: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          domains: z.array(z.string().max(100)).max(20).default([]),
          title: z.string().trim().min(2).max(100),
          description: z.string().max(2000),
          slots: z.number().int().min(1).max(49),
          skills: z
            .array(
              skill.extend({ importance: z.enum(["required", "preferred"]) }),
            )
            .max(30),
        }),
      )
      .max(15),
  })
  .superRefine((p,ctx)=>{if(!p.id&&!requiredDomains.safeParse(p.domains).success)ctx.addIssue({code:z.ZodIssueCode.custom,path:['domains'],message:'Choose at least one domain'});
    p.roles.forEach((r,i)=>{if(!r.id&&!requiredDomains.safeParse(r.domains.length?r.domains:p.domains).success)ctx.addIssue({code:z.ZodIssueCode.custom,path:['roles',i,'domains'],message:'Choose a role domain or a project domain to inherit'});});})
  .refine(
    (p) => p.roles.reduce((sum, r) => sum + r.slots, 0) <= p.team_size - 1,
    "Role slots cannot exceed team size minus the lead",
  );
export const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("apply"),
    project_id: z.string().uuid(),
    role_id: z.string().uuid().nullable(),
    message: z.string().max(1500).default(""),
  }),
  z.object({
    action: z.literal("invite"),
    project_id: z.string().uuid(),
    role_id: z.string().uuid().nullable(),
    target: z.string().uuid(),
    message: z.string().max(1500).default(""),
  }),
  z.object({
    action: z.literal("respond"),
    id: z.string().uuid(),
    kind: z.enum(["application", "invitation"]),
    decision: z.enum([
      "approved",
      "rejected",
      "withdrawn",
      "accepted",
      "declined",
      "cancelled",
    ]),
  }),
]);
