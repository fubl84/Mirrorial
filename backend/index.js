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

// Google OAuth2 Config (Built-in for Mirrorial)
const MIRRORIAL_CLIENT_ID = 'your-mirrorial-client-id.apps.googleusercontent.com'; // Replace with a real one or keep as is for user-provided flow

// API: Google Calendar Device Flow
app.get('/api/auth/google/device/start', async (req, res) => {
    try {
        const response = await axios.post('https://oauth2.googleapis.com/device/code', {
            client_id: MIRRORIAL_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/calendar.readonly'
        });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to start device flow', details: err.message });
    }
});

app.post('/api/auth/google/device/poll', async (req, res) => {
    try {
        const { device_code } = req.body;
        const response = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: MIRRORIAL_CLIENT_ID,
            device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        });

        if (response.data.access_token) {
            await fs.writeJson(TOKENS_PATH, response.data);
            res.json({ success: true });
        } else {
            res.json({ success: false, status: response.data.error });
        }
    } catch (err) {
        // Axios throws on 4xx, which Google uses for "pending"
        if (err.response && err.response.data.error === 'authorization_pending') {
            return res.json({ success: false, status: 'pending' });
        }
        res.status(500).json({ error: 'Polling failed', details: err.message });
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

// Helper: Auto-shutdown checker
const startPowerManager = () => {
    setInterval(async () => {
        try {
            const config = await fs.readJson(CONFIG_PATH);
            const power = config.system.power;
            
            if (power && power.autoShutdownEnabled && power.autoShutdownTime) {
                const now = new Date();
                const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                
                if (currentTime === power.autoShutdownTime) {
                    console.log(`🌙 Scheduled shutdown triggered at ${currentTime}`);
                    exec('sudo shutdown -h now');
                }
            }
        } catch (err) {
            console.error('Power Manager Error:', err);
        }
    }, 60000); // Check every minute
};

app.listen(PORT, async () => {
    await ensureConfig();
    startPowerManager();
    console.log(`🚀 Mirrorial Backend running on port ${PORT}`);
    console.log(`📄 Managing config at: ${CONFIG_PATH}`);
});
