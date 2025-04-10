const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
const PORT = process.env.PORT || 3000;

// Google Drive credentials from environment variables
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

// Set the credentials for Google Drive API using the tokens
oauth2Client.setCredentials({
  access_token: GOOGLE_ACCESS_TOKEN,
  refresh_token: GOOGLE_REFRESH_TOKEN,
});

// Automatically refresh the access token when it expires
oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    GOOGLE_REFRESH_TOKEN = tokens.refresh_token; // Save the new refresh token
  }
  GOOGLE_ACCESS_TOKEN = tokens.access_token; // Update the access token
});

const drive = google.drive({ version: "v3", auth: oauth2Client });

// Folder ID for your Google Drive folder
const DRIVE_FOLDER_ID = "13lFFV-q1Cse2xSWogmWr6VTLeaVd54V2";

// Middleware setup
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

  // Upload doodle to Google Drive
  try {
    const fileMetadata = {
      name: filename,
      parents: [DRIVE_FOLDER_ID], // Google Drive folder ID
    };
    const media = {
      mimeType: "image/png",
      body: Buffer.from(base64Data, 'base64'),
    };

    const driveResponse = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id",
    });

    console.log("✅ Doodle uploaded to Google Drive:", driveResponse.data.id);
    res.status(200).send("Saved and uploaded successfully!");
  } catch (err) {
    console.error("Error uploading doodle to Google Drive:", err);
    res.status(500).send("Failed to upload doodle to Google Drive");
  }
});

// DELETE: Remove a specific doodle from Google Drive
app.delete("/delete/:fileId", async (req, res) => {
  const { fileId } = req.params;

  // Delete the doodle from Google Drive
  try {
    await drive.files.delete({
      fileId: fileId,
    });

    console.log(`🗑️ Deleted doodle from Google Drive: ${fileId}`);
    res.status(200).send("Deleted successfully from Google Drive!");
  } catch (err) {
    console.error("Error deleting doodle from Google Drive:", err);
    res.status(500).send("Failed to delete doodle from Google Drive");
  }
});

// GET: Serve doodle gallery page with images from Google Drive
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
          <img src="https://drive.google.com/uc?id=${file.id}" alt="${file.name}" style="max-width:300px;margin:10px;border:2px solid #ccc;border-radius:8px;">
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
    console.error("Error fetching doodles from Google Drive:", err);
    res.status(500).send("Error fetching doodles.");
  }
});

// Optional test route
app.get("/test", (req, res) => {
  res.send("Server is alive!");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
