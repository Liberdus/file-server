const express = require('express');
const https = require('https');
const http = require('http');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const PORT = process.env.PORT || 2083;
const DATA_DIR = path.join(__dirname, 'data');

// HTTPS/SSL configuration
//const USE_HTTPS = process.env.USE_HTTPS === 'true';
const USE_HTTPS = 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './ssl/private.key';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './ssl/certificate.crt';
const SSL_CA_PATH = process.env.SSL_CA_PATH; // Optional for certificate chain


const app = express();
app.use(cors());
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Use disk storage for Multer, storing with random filenames initially
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR),
  filename: (req, file, cb) => {
    // Temporary unique filename (use timestamp + random hex)
    const tmpName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, tmpName);
  }
});
const upload = multer({ storage });

// POST /post: Save file and return its hash-based ID
app.post('/post', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const tmpPath = req.file.path;

  // Stream file and calculate hash
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(tmpPath);

  input.on('error', () => {
    fs.unlinkSync(tmpPath);
    res.status(500).json({ error: 'Failed to process file' });
  });

  input.on('end', () => {
    const fullHash = hash.digest('hex');
    const fileId = fullHash.slice(0, 10);
    const finalPath = path.join(DATA_DIR, fileId);

    // Move or rename file to final name (overwrite: optional)
    fs.rename(tmpPath, finalPath, (err) => {
      if (err) {
        // If a file with same hash exists, delete tmp and ok
        if (err.code === 'EEXIST' || fs.existsSync(finalPath)) {
          fs.unlinkSync(tmpPath);
          return res.json({ id: fileId });
        }
        return res.status(500).json({ error: 'Failed to rename file' });
      }
      res.json({ id: fileId });
    });
  });

  input.on('data', chunk => hash.update(chunk));
});

// GET /get/:id: Send file back to client
app.get('/get/:id', (req, res) => {
  const filePath = path.join(DATA_DIR, req.params.id);
  fs.stat(filePath, (err, stats) => {
    if (err) return res.status(404).json({ error: 'File not found' });
    res.sendFile(filePath);
  });
});

// DELETE /delete/:id: Delete file by ID
app.delete('/delete/:id', (req, res) => {
  const filePath = path.join(DATA_DIR, req.params.id);
  fs.unlink(filePath, err => {
    if (err) return res.status(404).json({ error: 'File not found or already deleted' });
    res.json({ success: true });
  });
});

/*
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
*/

// Function to create and start the server
function startServer() {
  if (USE_HTTPS) {
    // Check if SSL files exist
    if (!fs.existsSync(SSL_KEY_PATH)) {
      console.error(`❌ SSL private key not found: ${SSL_KEY_PATH}`);
      console.log('To generate self-signed certificates for testing:');
      console.log('mkdir -p ssl');
      console.log('openssl req -x509 -newkey rsa:4096 -keyout ssl/private.key -out ssl/certificate.crt -days 365 -nodes');
      process.exit(1);
    }

    if (!fs.existsSync(SSL_CERT_PATH)) {
      console.error(`❌ SSL certificate not found: ${SSL_CERT_PATH}`);
      process.exit(1);
    }

    // Read SSL certificate files
    const httpsOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH)
    };

    // Add certificate chain if provided
    if (SSL_CA_PATH && fs.existsSync(SSL_CA_PATH)) {
      httpsOptions.ca = fs.readFileSync(SSL_CA_PATH);
    }

    // Create HTTPS server
    const server = https.createServer(httpsOptions, app);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`SSL Server running on port ${PORT}`);
    });
  } else {
    // Create HTTP server
    const server = http.createServer(app);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}


// Start the server
startServer();




