// Import required modules
import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';
import cors from 'cors';

// Import routers
import ordersRouter from './routes/orders.js';
import relayerRouter from './routes/relayer.js';

// Import utility functions
import { testConnection } from './config/database.js';
import { syncDatabase } from './models/index.js';

// Load environment variables
dotenv.config();

// Ensure environment variables are loaded
if (!process.env.DB_DATABASE || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  throw new Error('Database configuration is missing in environment variables');
}

// Ensure the PORT is set
if (!process.env.PORT) {
  process.env.PORT = 3000; // Default port if not set
}



// Create an Express application
const app = express();
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3001', // Allow requests from this origin
}));
// --- Database Connection ---
// Test the database connection and sync models
const initializeDatabase = async () => {
  await testConnection();
  await syncDatabase();
};


// --- Swagger Definition ---
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Cardano Swap API',
      version: '1.0.0',
      description: 'API documentation for Cardano Swap application',
    },
    servers: [
      {
        url: 'http://localhost:3000',
      },
    ],
  },
  apis: ['./routes/*.js'], // files containing annotations as above
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));


// --- API Routes ---

// Mount routers
app.use('/api/orders', ordersRouter);
app.use('/api/relayer', relayerRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});


// --- Start the server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
  
  // Initialize database
  await initializeDatabase();
});
