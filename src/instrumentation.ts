export async function register(){if(process.env.NEXT_RUNTIME==="nodejs"){
 const {configuredProvider}=await import("./lib/matching/identity");configuredProvider();
 // Validate configuration at boot. Load the native model lazily so a failed
 // model cannot prevent the diagnostic endpoints and read routes from starting.
}}
