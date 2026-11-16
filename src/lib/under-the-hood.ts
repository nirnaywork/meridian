import { FlaskConical } from "lucide-react";

const NAME = "Under the Hood";
export const UNDER_THE_HOOD = {
  label: NAME,
  title: NAME,
  icon: FlaskConical,
  tooltip: "See how your embedding and match score are calculated",
  intro:
    "Explore the stored inputs and numbers behind Meridian’s embeddings. These explanations read saved data and never run the model.",
} as const;
export type HoodTab = "embedding" | "roles" | "similarity";
