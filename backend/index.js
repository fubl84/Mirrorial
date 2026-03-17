const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const morgan = require('morgan');
const { exec } = require('child_process');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, '../config.json');
const TOKENS_PATH = path.join(__dirname, '../tokens.json');

app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());

// Serve Static Frontend (built React app)
app.use(express.static(path.join(__dirname, '../remote_ui/dist')));

// Helper: Ensure config exists
const ensureConfig = async () => {
    if (!await fs.pathExists(CONFIG_PATH)) {
        const example = path.join(__dirname, '../configs/config.json.example');
        await fs.copy(example, CONFIG_PATH);
    }
};

// API: Get Config
app.get('/api/config', async (req, res) => {
    try {
        await ensureConfig();
        const config = await fs.readJson(CONFIG_PATH);
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read config', details: err.message });
    }
});

// API: Save Config
app.post('/api/config', async (req, res) => {
    try {
        const newConfig = req.body;
        await fs.writeJson(CONFIG_PATH, newConfig, { spaces: 2 });
        res.json({ success: true, message: 'Config saved successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save config', details: err.message });
    }
});

// API: System Commands
app.post('/api/system/:command', (req, res) => {
    const { command } = req.params;
    let shellCmd = '';

    switch (command) {
        case 'reboot':
            shellCmd = 'sudo reboot';
            break;
        case 'shutdown':
            shellCmd = 'sudo shutdown -h now';
            break;
        case 'restart-display':
            shellCmd = 'sudo systemctl restart mirror-display';
            break;
        default:
            return res.status(400).json({ error: 'Invalid command' });
    }

    exec(shellCmd, (error) => {
        if (error) {
            return res.status(500).json({ error: 'Command execution failed', details: error.message });
        }
        res.json({ success: true, message: `Command ${command} triggered` });
    });
});

// API: Google Calendar Handshake
app.get('/api/auth/google/url', async (req, res) => {
    try {
        const config = await fs.readJson(CONFIG_PATH);
        const cal = config.layout.flatMap(p => p.modules).find(m => m.type === 'calendar')?.config;
        
        if (!cal || !cal.clientId || !cal.clientSecret) {
            return res.status(400).json({ error: 'Google Client ID/Secret not configured in layout.' });
        }

        const oauth2Client = new OAuth2Client(
            cal.clientId,
            cal.clientSecret,
            `http://${req.hostname}:3000/api/auth/google/callback`
        );

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar.readonly'],
            prompt: 'consent'
        });

        res.json({ url });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate auth URL', details: err.message });
    }
});

app.get('/api/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        const config = await fs.readJson(CONFIG_PATH);
        const cal = config.layout.flatMap(p => p.modules).find(m => m.type === 'calendar')?.config;

        const oauth2Client = new OAuth2Client(
            cal.clientId,
            cal.clientSecret,
            `http://${req.hostname}:3000/api/auth/google/callback`
        );

        const { tokens } = await oauth2Client.getToken(code);
        await fs.writeJson(TOKENS_PATH, tokens);

        res.send('<h1>Authentication Successful!</h1><p>You can close this window and return to the Mirrorial Dashboard.</p>');
    } catch (err) {
        res.status(500).send(`Authentication Failed: ${err.message}`);
    }
});

app.get('/api/auth/google/status', async (req, res) => {
    try {
        const exists = await fs.pathExists(TOKENS_PATH);
        res.json({ authenticated: exists });
    } catch (err) {
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// Fallback to React index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../remote_ui/dist/index.html'));
});

app.listen(PORT, async () => {
    await ensureConfig();
    console.log(`🚀 Mirrorial Backend running on port ${PORT}`);
    console.log(`📄 Managing config at: ${CONFIG_PATH}`);
});
