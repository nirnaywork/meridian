import { FeatureFlags } from "@/components/feature-flags";
import { AuthProvider } from "@/components/auth-provider";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Meridian — Find your people. Build your thing.",
    template: "%s · Meridian",
  },
  description:
    "Find a student project where your skills belong. Connect with complementary teammates and turn a good idea into something real.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('meridian-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
        <FeatureFlags
          showMatchPercent={process.env.SHOW_MATCH_PERCENT !== "false"}
        >
          <AuthProvider>{children}</AuthProvider>
        </FeatureFlags>
      </body>
    </html>
  );
}
