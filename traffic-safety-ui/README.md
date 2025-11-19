# Traffic Safety UI

A React-based user interface for the Traffic Safety Management System (TSIM) built with Vite, TypeScript, and TailwindCSS.

## Features

- **Zone Management**: View and activate traffic zones
- **Real-time Activation**: Activate zones based on wind direction
- **Responsive Design**: Mobile-friendly interface
- **TypeScript**: Full type safety
- **Modern UI**: Built with TailwindCSS

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **TailwindCSS** for styling
- **Axios** for HTTP requests
- **TypeScript** for type safety

## Project Structure

```
src/
├── api/           # API client and service functions
├── components/    # Reusable React components
├── pages/         # Page components
├── types/         # TypeScript type definitions
└── App.tsx        # Main application component
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- TSIM Backend running on `http://localhost:8001`

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

## API Integration

The application connects to the TSIM FastAPI backend with the following endpoints:

- `GET /zones/` - Get all zones
- `POST /zones/` - Create a new zone
- `GET /routes/` - Get all routes
- `POST /routes/` - Create a new route
- `GET /devices/` - Get all devices
- `POST /devices/` - Create a new device
- `POST /activate/` - Activate a zone

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_BASE_URL=http://localhost:8001
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
