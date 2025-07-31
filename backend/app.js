// Import required modules
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { testConnection } = require('./config/database');
const { syncDatabase } = require('./models');
const ordersRouter = require('./routes/orders');
const relayerRouter = require('./routes/relayer');
require('dotenv').config();

// Create an Express application
const app = express();
app.use(express.json());

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
