const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const morgan = require('morgan');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, '../config.json');

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

// Fallback to React index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../remote_ui/dist/index.html'));
});

app.listen(PORT, async () => {
    await ensureConfig();
    console.log(`🚀 Mirrorial Backend running on port ${PORT}`);
    console.log(`📄 Managing config at: ${CONFIG_PATH}`);
});
