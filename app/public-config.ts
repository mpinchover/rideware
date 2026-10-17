export const STREAM_API_KEY = "dftap49bg6c2";

const LOCAL_MATCH_SERVER_URL = "http://127.0.0.1:5050";
const CLOUD_MATCH_SERVER_URL = "https://rideshare-match-317303363733.us-central1.run.app";

// true uses the local match server. false uses Cloud Run.
const useLocalMatchServer = false;

export const MATCH_SERVER_URL = useLocalMatchServer
  ? LOCAL_MATCH_SERVER_URL
  : CLOUD_MATCH_SERVER_URL;

export function matchUrl(path: string) {
  return `${MATCH_SERVER_URL.replace(/\/$/, "")}${path}`;
}
