// Frozen corpus: changing names/aliases requires a hashed-provider version bump.
const groups: Record<string, string> = {
  Web: "HTML|CSS|JavaScript|TypeScript|React|Next.js|Vue|Nuxt|Angular|Svelte|SvelteKit|Astro|Remix|Node.js|Express|Fastify|NestJS|Deno|Bun|PHP|Laravel|Symfony|Ruby|Ruby on Rails|Python|Django|Flask|FastAPI|Go|Gin|Rust|Axum|Java|Spring Boot|C#|ASP.NET|GraphQL|REST APIs|WebSockets|Tailwind CSS|Sass|Bootstrap|Material UI|Chakra UI|Redux|Zustand|React Query|Vite|Webpack|Accessibility|Web Performance|SEO|PWA|Service Workers|Web Components",
  Mobile:
    "Swift|SwiftUI|UIKit|Objective-C|Kotlin|Jetpack Compose|Android SDK|Flutter|Dart|React Native|Expo|Ionic|Capacitor|Mobile UX|App Store Optimization|Push Messaging|Core Data|Room|Realm|Firebase|Bluetooth|Mobile Testing|Xamarin|Unity Mobile",
  "ML / AI":
    "Machine Learning|Deep Learning|PyTorch|TensorFlow|Keras|Scikit-learn|Computer Vision|Natural Language Processing|Reinforcement Learning|Transfer Learning|Feature Engineering|Model Evaluation|MLOps|ONNX|OpenCV|Hugging Face|Sentence Embeddings|Vector Search|Recommendation Systems|Time Series|Anomaly Detection|XGBoost|LightGBM|CatBoost|Neural Networks|Image Segmentation|Object Detection|Speech Recognition|Signal Processing|Statistical Learning",
  Data: "SQL|PostgreSQL|MySQL|SQLite|MongoDB|Redis|Elasticsearch|ClickHouse|BigQuery|Snowflake|Apache Spark|Apache Kafka|Apache Airflow|dbt|Pandas|NumPy|SciPy|R|Julia|Data Visualization|Tableau|Power BI|Looker|D3.js|Matplotlib|Seaborn|Plotly|ETL|Data Modeling|Data Warehousing|Data Cleaning|Data Analysis|Statistics|Probability|A/B Testing|Excel|Google Sheets|DuckDB|Polars|Apache Flink",
  Design:
    "Figma|Sketch|Adobe XD|UI Design|UX Design|UX Research|Interaction Design|Prototyping|Wireframing|Design Systems|Typography|Color Theory|Information Architecture|Usability Testing|Adobe Photoshop|Adobe Illustrator|Adobe InDesign|Motion Design|After Effects|Blender|Cinema 4D|3D Modeling|Illustration|Icon Design|Brand Identity|Visual Design|Service Design|Inclusive Design|User Interviews|Journey Mapping",
  DevOps:
    "Linux|Bash|PowerShell|Docker|Kubernetes|Terraform|Ansible|AWS|Azure|Google Cloud|Cloudflare|Vercel|Netlify|CI/CD|GitHub Actions|GitLab CI|Jenkins|Nginx|Apache HTTP|Prometheus|Grafana|OpenTelemetry|Datadog|Sentry|Helm|Argo CD|Pulumi|Packer|Vault|Consul|Site Reliability|Load Testing|Networking|DNS|TLS|Git|GitHub|GitLab",
  Cybersecurity:
    "Application Security|Network Security|Penetration Testing|Threat Modeling|OWASP|Cryptography|Identity Management|OAuth|OpenID Connect|JWT|Security Auditing|Incident Response|Digital Forensics|Malware Analysis|Reverse Engineering|Burp Suite|Wireshark|Metasploit|Nmap|Kali Linux|Secure Coding|Vulnerability Assessment|Cloud Security|Zero Trust|SIEM",
  "Embedded / IoT":
    "C|C++|Embedded Systems|Arduino|Raspberry Pi|ESP32|Microcontrollers|RTOS|FreeRTOS|Embedded Linux|PCB Design|KiCad|Altium|Electronics|Sensors|MQTT|Zigbee|LoRaWAN|Robotics|ROS|Control Systems|FPGA|Verilog|VHDL|I2C|SPI|UART|CAN Bus|3D Printing|CAD",
  "Game Development":
    "Unity|Unreal Engine|Godot|Game Design|Level Design|Game Physics|Shaders|GLSL|HLSL|OpenGL|Vulkan|DirectX|WebGL|Three.js|Babylon.js|Phaser|PixiJS|Game AI|Multiplayer Networking|Pixel Art|Character Animation|Rigging|Texture Painting|Procedural Generation|Game Audio",
  "Product / PM":
    "Product Management|Project Management|Agile|Scrum|Kanban|Roadmapping|Product Discovery|User Stories|Requirements Analysis|Stakeholder Management|Market Research|Competitive Analysis|Product Analytics|Growth Strategy|Business Analysis|Business Modeling|Lean Startup|OKRs|Sprint Planning|Jira|Linear|Notion|Miro|Technical Writing|Documentation",
  Content:
    "Copywriting|Content Writing|Content Strategy|Blogging|Creative Writing|Editing|Proofreading|Storytelling|Video Editing|DaVinci Resolve|Premiere Pro|Photography|Videography|Audio Editing|Podcast Production|Audacity|Translation|Localization|Public Speaking|Presentation Design|Instructional Design|Curriculum Design|Community Management|Interviewing|Research",
  Marketing:
    "Digital Marketing|Content Marketing|Social Media Marketing|Email Marketing|Search Engine Marketing|Google Analytics|Google Ads|Meta Ads|Marketing Analytics|Conversion Optimization|Growth Marketing|Brand Strategy|Influencer Marketing|Event Planning|Public Relations|Partnerships|Sales|Customer Research|CRM|HubSpot|Mailchimp|Campaign Management|Fundraising|Entrepreneurship|Sustainability",
};
const aliases: Record<string, string[]> = {
  React: ["reactjs", "react.js"],
  "Next.js": ["nextjs", "next"],
  "Node.js": ["nodejs", "node"],
  JavaScript: ["js", "ecmascript"],
  TypeScript: ["ts"],
  "Machine Learning": ["ml"],
  "Deep Learning": ["dl"],
  "Natural Language Processing": ["nlp"],
  "Computer Vision": ["cv"],
  PostgreSQL: ["postgres", "psql"],
  "C++": ["cpp", "cplusplus"],
  "C#": ["csharp"],
  "UI Design": ["ui", "user interface design"],
  "UX Design": ["ux", "user experience design"],
  "Scikit-learn": ["sklearn"],
  "Tailwind CSS": ["tailwind"],
  "CI/CD": ["cicd"],
  "React Native": ["reactnative"],
  "Amazon Web Services": ["amazon aws"],
  AWS: ["amazon web services"],
  "Google Cloud": ["gcp"],
  "REST APIs": ["rest", "rest api"],
  Vue: ["vuejs", "vue.js"],
};
export const taxonomy = Object.entries(groups).flatMap(([category, names]) =>
  names
    .split("|")
    .map((name) => ({
      name,
      category,
      slug: skillKey(name),
      aliases: aliases[name] ?? [],
      is_verified: true,
    })),
);
export function skillKey(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\+/g, " plus ")
    .replace(/#/g, " sharp ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, "-");
}
const lookup = new Map(
  taxonomy.flatMap((s) =>
    [s.name, ...s.aliases].map((a) => [skillKey(a), s.name] as const),
  ),
);
export function normalizeSkill(s: string) {
  return (
    lookup.get(skillKey(s)) ?? s.normalize("NFKC").trim().replace(/\s+/g, " ")
  );
}
