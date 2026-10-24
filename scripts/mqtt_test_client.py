#!/usr/bin/env python3
"""
MQTT Test Client
Test tool untuk verify MQTT communication dengan ESP32

Requirements:
    pip install paho-mqtt

Usage:
    python mqtt_test_client.py

Functions:
- Subscribe ke semua greenhouse topics
- Display incoming messages
- Send test commands ke ESP32
"""

import paho.mqtt.client as mqtt
import json
import time
from datetime import datetime

# ============================================================================
# CONFIGURATION
# ============================================================================
MQTT_BROKER = "broker.example.com"  # Ganti dengan broker address
MQTT_PORT = 1883
MQTT_USER = "greenhouse_user"
MQTT_PASSWORD = "secure_password"
DEVICE_ID = "greenhouse_001"

# Topics
TOPIC_SENSORS = f"greenhouse/{DEVICE_ID}/sensors"
TOPIC_ACTUATORS = f"greenhouse/{DEVICE_ID}/actuators"
TOPIC_STATUS = f"greenhouse/{DEVICE_ID}/status"
TOPIC_CMD_PUMP = f"greenhouse/{DEVICE_ID}/commands/pump"
TOPIC_CMD_FAN = f"greenhouse/{DEVICE_ID}/commands/fan"
TOPIC_CMD_LIGHT = f"greenhouse/{DEVICE_ID}/commands/light"

# ============================================================================
# MQTT CALLBACKS
# ============================================================================
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("✓ Connected to MQTT broker")
        # Subscribe to all greenhouse topics
        client.subscribe(f"greenhouse/{DEVICE_ID}/#")
        print(f"✓ Subscribed to greenhouse/{DEVICE_ID}/#")
    else:
        print(f"✗ Connection failed with code {rc}")

def on_message(client, userdata, msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[{timestamp}] Topic: {msg.topic}")
    
    try:
        # Try to parse as JSON
        payload = json.loads(msg.payload.decode())
        print(json.dumps(payload, indent=2))
    except:
        # If not JSON, print as string
        print(f"Payload: {msg.payload.decode()}")

def on_disconnect(client, userdata, rc):
    if rc != 0:
        print(f"✗ Unexpected disconnection (code {rc})")

# ============================================================================
# COMMAND FUNCTIONS
# ============================================================================
def send_pump_command(client, command):
    """Send pump control command: ON, OFF, or AUTO"""
    client.publish(TOPIC_CMD_PUMP, command)
    print(f"→ Sent pump command: {command}")

def send_fan_command(client, command):
    """Send fan control command: ON, OFF, or AUTO"""
    client.publish(TOPIC_CMD_FAN, command)
    print(f"→ Sent fan command: {command}")

def send_light_command(client, command):
    """Send light control command: ON, OFF, or AUTO"""
    client.publish(TOPIC_CMD_LIGHT, command)
    print(f"→ Sent light command: {command}")

# ============================================================================
# MAIN
# ============================================================================
def main():
    print("========================================")
    print("MQTT Test Client - Smart Greenhouse")
    print("========================================\n")
    
    # Create MQTT client
    client = mqtt.Client()
    client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
    
    # Set callbacks
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect
    
    # Connect to broker
    print(f"Connecting to {MQTT_BROKER}:{MQTT_PORT}...")
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        print(f"✗ Connection error: {e}")
        return
    
    # Start network loop in background
    client.loop_start()
    
    # Interactive command menu
    print("\n========================================")
    print("COMMAND MENU")
    print("========================================")
    print("1. Pump ON")
    print("2. Pump OFF")
    print("3. Pump AUTO")
    print("4. Fan ON")
    print("5. Fan OFF")
    print("6. Fan AUTO")
    print("7. Light ON")
    print("8. Light OFF")
    print("9. Light AUTO")
    print("0. Exit")
    print("\nListening for messages... (press number to send command)")
    print("========================================\n")
    
    try:
        while True:
            cmd = input()
            
            if cmd == "1":
                send_pump_command(client, "ON")
            elif cmd == "2":
                send_pump_command(client, "OFF")
            elif cmd == "3":
                send_pump_command(client, "AUTO")
            elif cmd == "4":
                send_fan_command(client, "ON")
            elif cmd == "5":
                send_fan_command(client, "OFF")
            elif cmd == "6":
                send_fan_command(client, "AUTO")
            elif cmd == "7":
                send_light_command(client, "ON")
            elif cmd == "8":
                send_light_command(client, "OFF")
            elif cmd == "9":
                send_light_command(client, "AUTO")
            elif cmd == "0":
                print("\nExiting...")
                break
            else:
                print("Invalid command. Enter 0-9.")
    
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    
    finally:
        client.loop_stop()
        client.disconnect()
        print("Disconnected from MQTT broker")

if __name__ == "__main__":
    main()
