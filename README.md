# Waymo Open Dataset 3D Visualization

This project provides a web-based 3D visualization tool for the Waymo Open Dataset (specifically the Motion scenes). It renders road graphs, dynamic agents (vehicles, pedestrians, cyclists), traffic lights, and various metadata like intended paths and velocity vectors.

## Features

- **3D Rendering**: Full 3D scene using Three.js and React Three Fiber.
- **Dynamic Agents**:
  - **Waymo Car (SDC)**: Detailed model with sensors, animated wheels, and bright green velocity vector.
  - **Pedestrians**: Mannequin-style 3D models.
  - **Cyclists**: Simplified cyclist representation.
  - **Others**: Colored boxes (Blue for vehicles, Green for cyclists, Orange for pedestrians).
- **Environment**:
  - **Road Graph**: Visualization of lanes, crosswalks, and road boundaries.
  - **Traffic Lights**: 3D Sphere representations changing color (Red, Yellow, Green) based on state.
- **Analytics**:
  - **Path Samples**: Visualization of valid/intended trajectories (Cyan lines).
  - **Velocity Vectors**: Direction and speed indicators for all agents (Bright for SDC, Muted for others).
  - **Speedometer**: Real-time speed display for the Ego vehicle.

## Project Structure

- `motion/backend`: Node.js/Express server that parses TFRecord files and streams data to the frontend.
- `motion/frontend`: React application using Vite and Three.js for rendering.

## Setup & Running

### Prerequisites

- Node.js (v16+)
- Waymo Open Dataset TFRecord files (placed in `motion/backend/data`)

### 1. Backend

Navigate to the backend directory and install dependencies:

```bash
cd motion/backend
npm install
```

Start the server:

```bash
node server.js
```

The server runs on `http://localhost:3000`. It provides endpoints to stream scenario data.

### 2. Frontend

Navigate to the frontend directory and install dependencies:

```bash
cd motion/frontend
npm install
```

Start the development server:

```bash
npm run dev
```

Open your browser at `http://localhost:5173` (or the port shown in terminal).

## Controls

- **Orbit**: Left Click + Drag
- **Pan**: Right Click + Drag
- **Zoom**: Scroll Wheel
- **Camera Variations**: automatic camera angles are applied on scenario load.

## Data Source

Place your `.tfrecord` files from the Waymo Open Dataset into `motion/backend/data`. The backend script `read_data_stream.js` is configured to read these files.
