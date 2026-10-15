import { defineConfig } from "tinacms";

export default defineConfig({
  branch: "main",
  clientId: "b3c63e58-fa43-41c0-8a19-5b008f76b613", // Ganti dengan Client ID Anda nanti
  token: "9d110d08a1f4ea376cbfb27ce57699ad1aea31bc",       // Ganti dengan Token Anda nanti
  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },
  media: {
    tina: {
      mediaRoot: "images/uploads",
      publicFolder: "public",
    },
  },
  schema: {
    collections: [
      {
        name: "post",
        label: "Artikel Blog",
        path: "content/blog", // <-- Menggunakan 'path' (bukan folder)
        format: "md",
        fields: [
          {
            type: "string",
            name: "title",
            label: "Judul",
            isTitle: true,
            required: true,
          },
          {
            type: "rich-text",
            name: "body",
            label: "Isi Konten",
            isBody: true,
          },
        ],
      },
    ],
  },
});