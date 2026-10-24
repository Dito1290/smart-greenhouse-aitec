# 🌱 Smart Greenhouse AI

**An IoT-based greenhouse monitoring and control platform powered by ESP32, MQTT, and Google Gemini AI.**

Smart Greenhouse AI is a prototype platform that integrates environmental monitoring, greenhouse equipment control, a mobile dashboard, and AI-assisted interaction through a backend gateway.

## ✨ Key Features

- **Environmental Monitoring** — Collect and display environmental sensor readings from ESP32.
- **MQTT Communication** — Exchange sensor data and relay commands through an MQTT broker.
- **Relay Control** — Control greenhouse equipment, including fertilizer, exhaust, and lighting relays.
- **Mobile Dashboard** — Monitor greenhouse conditions through React Native and Expo.
- **AI Assistant** — Provide greenhouse-related assistance using Google Gemini through the backend.
- **Secure Gateway** — Keep MQTT credentials and AI API keys on the backend.
- **Sensor Diagnostics** — Monitor backend connectivity, MQTT status, sensor availability, and relay reporting.

## 🏗️ System Architecture

```text
Environmental Sensors
        │
        ▼
      ESP32
        │ MQTT
        ▼
   MQTT Broker
        │
        ▼
 Backend Gateway
   ├── Sensor Data
   ├── Relay Commands
   └── Gemini AI
        │ HTTP API
        ▼
 Mobile Application
   ├── Dashboard
   ├── Sensor Monitoring
   ├── Relay Controls
   └── AI Assistant
```

## 🧰 Technology Stack

| Component | Technology |
|---|---|
| Hardware | ESP32 |
| Messaging | MQTT |
| Backend | Node.js, TypeScript |
| Mobile | React Native, Expo |
| AI Integration | Google Gemini API |
| Testing | Vitest, API and MQTT tests |

## 📁 Project Structure

```text
smart-greenhouse-aitec/
├── backend/       # API, MQTT gateway, AI integration and tests
├── mobile/        # React Native mobile application
├── config/        # Example configuration files
├── docs/          # Project documentation
├── hardware/      # Hardware architecture and bill of materials
├── scripts/       # Sensor calibration and MQTT utilities
├── src/           # ESP32 firmware
├── README.md      # Project documentation
└── .gitignore
```

## 🚀 Getting Started

### Prerequisites

- Node.js and npm
- Git
- Expo Go compatible with the project's Expo SDK, or a suitable development build
- ESP32 hardware and a configured MQTT broker for hardware integration

### 1. Clone the Repository

```bash
git clone https://github.com/Dito1290/smart-greenhouse-aitec.git
cd smart-greenhouse-aitec
```

### 2. Configure and Run the Backend

```bash
cd backend
npm install
cp .env.example .env
```

Configure the required environment variables in `backend/.env`, including the MQTT credentials, Gemini API key, and a strong application access token.

Build and start the backend:

```bash
npm run build
npm start
```

### 3. Run the Mobile Application

Open a separate terminal:

```bash
cd ~/smart-greenhouse-aitec/mobile
npm install
npx expo start
```

Open the app using a compatible Expo Go version or an appropriate development build. Configure the backend address and application access token in the app's connection settings.

### 4. Configure the ESP32

Review the firmware at `src/smart_greenhouse_esp32.ino` and the example configuration files in `config/`.

Configure Wi-Fi, MQTT connectivity, sensor hardware, and relay pin assignments according to the actual hardware setup.

## 📡 MQTT Integration

| Purpose | Topic |
|---|---|
| Environmental data | `environment/data` |
| Relay control | `relay/control` |

The ESP32 publishes sensor readings and receives relay commands through MQTT. Verify the broker settings, message payloads, and hardware configuration before deployment.

## 🔐 Security

- Store MQTT credentials and Gemini API keys in backend environment variables.
- Use a strong, randomly generated application access token.
- Never commit `.env` files, API keys, passwords, or private tokens.
- Restrict backend and MQTT broker access appropriately.
- Use HTTPS and suitable broker security for production deployments.
- Keep example configuration files free of real credentials.

## 🧪 Testing

Backend and mobile test files are included in the repository.

Run the test scripts defined in each component's `package.json`. MQTT integration tests may require a configured broker or dedicated test environment.

## ⚠️ Project Status

Smart Greenhouse AI is an actively developed IoT greenhouse prototype. Sensor calibration, hardware integration, relay behavior, network connectivity, and AI responses should be validated in the target environment before operational use.

A successfully transmitted relay command does not necessarily confirm that the physical relay or connected equipment has changed state. Physical state confirmation requires appropriate feedback from the hardware.

## 👥 Project Team

This project was developed collaboratively by the following team members.

| No. | Name | Student ID (NPM) |
|:---:|---|:---:|
| 1 | Dito Gilang Permadi | 24782073 |
| 2 | Arko Fernanda Wibawa | 24782006 |
| 3 | Ananda Haris Rahmadi | 25782032 |
| 4 | Machmud Al Hasan | 25782044 |

**Project Focus:** Internet of Things (IoT), ESP32, MQTT, Environmental Monitoring, Greenhouse Automation, and AI Integration.

**Maintainer:** Dito Gilang Permadi  
**GitHub:** [@Dito1290](https://github.com/Dito1290)

---

*Smart Greenhouse AI — Connecting IoT monitoring, greenhouse automation, and AI-assisted interaction.*
