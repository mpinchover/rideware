export const STREAM_API_KEY = "dftap49bg6c2";

// Replace this with the Cloud Run HTTPS URL after deploying the match server.
export const MATCH_SERVER_URL = "http://127.0.0.1:5050";

export function matchUrl(path: string) {
  return `${MATCH_SERVER_URL.replace(/\/$/, "")}${path}`;
}
