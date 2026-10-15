import { createClient } from "tinacms/dist/client";
import { queries } from "./types.js";
export const client = createClient({ url: "http://localhost:4001/graphql", token: "9d110d08a1f4ea376cbfb27ce57699ad1aea31bc", queries,  });
export default client;
  