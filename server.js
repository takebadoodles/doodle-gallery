const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { google } = require("googleapis");
const stream = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  access_token: GOOGLE_ACCESS_TOKEN,
  refresh_token: GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: "v3", auth: oauth2Client });

const DRIVE_FOLDER_ID = "13lFFV-q1Cse2xSWogmWr6VTLeaVd54V2";

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// POST: Upload a doodle to Google Drive
app.post("/submit", async (req, res) => {
  const { imageData } = req.body;
  if (!imageData) return res.status(400).send("Missing imageData");

  const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
  const filename = `doodle-${Date.now()}.png`;

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const response = await drive.files.create({
      resource: {
        name: filename,
        parents: [DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: "image/png",
        body: bufferStream,
      },
      fields: "id",
    });

    const fileId = response.data.id;

    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    console.log("✅ Uploaded doodle:", `https://drive.google.com/uc?id=${fileId}`);
    res.status(200).send("Saved and uploaded successfully!");
  } catch (err) {
    console.error("Error uploading doodle to Google Drive:", err);
    res.status(500).send("Failed to upload doodle to Google Drive");
  }
});

// DELETE: Remove a doodle from Drive
app.delete("/delete/:fileId", async (req, res) => {
  const { fileId } = req.params;

  try {
    await drive.files.delete({ fileId });
    console.log(`🗑️ Deleted doodle: ${fileId}`);
    res.status(200).send("Deleted successfully!");
  } catch (err) {
    console.error("Error deleting doodle:", err);
    res.status(500).send("Failed to delete doodle");
  }
});

// GET: Render the doodle gallery
app.get("/", async (req, res) => {
  try {
    const listResponse = await drive.files.list({
      q: `'${DRIVE_FOLDER_ID}' in parents and mimeType = 'image/png'`,
      fields: "files(id, name)",
    });

    const imageCards = listResponse.data.files
      .sort((a, b) => b.name.localeCompare(a.name))
      .map((file) => {
        const embedUrl = `https://drive.google.com/uc?id=${file.id}`;
        return `
          <div style="margin: 20px; display: inline-block;">
            <img src="${embedUrl}" alt="${file.name}" style="max-width:300px;margin:10px;border:2px solid #ccc;border-radius:8px;">
            <br>
            <button onclick="deleteImage('${file.id}')">🗑️ Delete</button>
          </div>
        `;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>My Doodle Gallery</title>
          <style>
            body {
              background-color: #feb1cb;
              font-family: sans-serif;
              text-align: center;
              padding: 2rem;
            }
            h1 {
              font-size: 2rem;
            }
            button {
              background: #ff4b5c;
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: 5px;
              cursor: pointer;
            }
            button:hover {
              background: #e04353;
            }
          </style>
        </head>
        <body>
          <h1>My Doodle Gallery</h1>
          ${imageCards || "<p>No doodles yet!</p>"}
          <script>
            function deleteImage(fileId) {
              if (confirm("Are you sure you want to delete this doodle?")) {
                fetch('/delete/' + fileId, { method: 'DELETE' })
                  .then(res => {
                    if (res.ok) {
                      alert("Deleted!");
                      location.reload();
                    } else {
                      alert("Failed to delete.");
                    }
                  });
              }
            }
          </script>
        </body>
      </html>
    `;
    res.send(html);
  } catch (err) {
    console.error("Error fetching doodles:", err);
    res.status(500).send("Error loading gallery.");
  }
});

app.get("/test", (req, res) => {
  res.send("Server is alive!");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
