const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { google } = require("googleapis");
const stream = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

// Google Drive credentials from environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
let GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN;
let GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  access_token: GOOGLE_ACCESS_TOKEN,
  refresh_token: GOOGLE_REFRESH_TOKEN,
});

oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
  }
  GOOGLE_ACCESS_TOKEN = tokens.access_token;
});

const drive = google.drive({ version: "v3", auth: oauth2Client });

// Your Google Drive folder ID
const DRIVE_FOLDER_ID = "13lFFV-q1Cse2xSWogmWr6VTLeaVd54V2";

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// POST: Submit new doodle
app.post("/submit", async (req, res) => {
  const { imageData } = req.body;
  if (!imageData) {
    console.error("Error: Missing imageData");
    return res.status(400).send("Missing imageData");
  }

  const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
  const filename = `doodle-${Date.now()}.png`;

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const fileMetadata = {
      name: filename,
      parents: [DRIVE_FOLDER_ID],
    };

    const media = {
      mimeType: "image/png",
      body: bufferStream,
    };

    const driveResponse = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: "id",
    });

    const fileId = driveResponse.data.id;

    // Make file public
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    // Explicitly share it (just in case)
    await drive.files.update({
      fileId,
      requestBody: {
        shared: true,
      },
    });

    console.log("✅ Doodle uploaded and shared:", fileId);
    res.status(200).send("Saved and uploaded successfully!");
  } catch (err) {
    console.error("Error uploading doodle to Google Drive:", err);
    res.status(500).send("Failed to upload doodle to Google Drive");
  }
});

// DELETE: Remove doodle from Drive
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

// GET: Show doodle gallery
app.get("/", async (req, res) => {
  try {
    const listResponse = await drive.files.list({
      q: `'${DRIVE_FOLDER_ID}' in parents and mimeType = 'image/png'`,
      fields: "files(id, name)",
    });

    const imageCards = listResponse.data.files
      .sort((a, b) => b.name.localeCompare(a.name))
      .map((file) => `
        <div style="margin: 20px; display: inline-block;">
          <img src="https://drive.google.com/uc?export=view&id=${file.id}" alt="${file.name}" style="max-width:300px;margin:10px;border:2px solid #ccc;border-radius:8px;">
          <br>
          <button onclick="deleteImage('${file.id}')">🗑️ Delete</button>
        </div>
      `)
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
    res.status(500).send("Error fetching doodles.");
  }
});

// Optional test route
app.get("/test", (req, res) => {
  res.send("Server is alive!");
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
