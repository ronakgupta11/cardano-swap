# Cardano Swap Backend

A backend application for handling Cardano token swaps with orders and relayer functionality.

## Features

- **Orders Management**: Create, retrieve, and manage swap orders
- **Relayer Services**: Monitor and process orders
- **PostgreSQL Database**: Using Sequelize ORM
- **API Documentation**: Swagger/OpenAPI documentation
- **RESTful APIs**: Well-structured REST endpoints

## Project Structure

```
backend/
├── config/
│   └── database.js          # Database configuration
├── controllers/
│   ├── ordersController.js  # Orders business logic
│   └── relayerController.js # Relayer business logic
├── models/
│   ├── index.js            # Models index and database sync
│   └── Order.js            # Order model definition
├── routes/
│   ├── orders.js           # Orders API routes
│   └── relayer.js          # Relayer API routes
├── app.js                  # Main application file
├── package.json
├── .env                    # Environment variables
└── .env.example           # Environment variables template
```

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Database Setup**
   - Make sure PostgreSQL is running
   - Update `.env` file with your database credentials
   - The application will automatically create the tables on startup

3. **Environment Variables**
   Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```

4. **Start the Application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

## API Endpoints

### Orders
- `GET /api/orders` - Get all orders (with pagination and filtering)
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create a new order
- `PATCH /api/orders/:id/status` - Update order status

### Relayer
- `GET /api/relayer/status` - Get relayer status
- `GET /api/relayer/stats` - Get relayer statistics
- `POST /api/relayer/process/:orderId` - Process an order

### Other
- `GET /health` - Health check endpoint
- `GET /api-docs` - Swagger API documentation

## Order Model

The Order model includes the following fields:

- `id` (UUID) - Unique identifier
- `fromAddress` - Sender's address
- `toAddress` - Receiver's address
- `fromToken` - Token to swap from
- `toToken` - Token to swap to
- `fromAmount` - Amount to swap from
- `toAmount` - Amount to receive
- `status` - Order status (pending, processing, completed, failed, cancelled)
- `txHash` - Transaction hash
- `relayerFee` - Fee for the relayer
- `expiresAt` - Order expiration time
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

## Example API Usage

### Create an Order
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "fromAddress": "addr1...",
    "toAddress": "addr2...",
    "fromToken": "ADA",
    "toToken": "USDC",
    "fromAmount": "100.0",
    "toAmount": "150.0",
    "relayerFee": "1.0"
  }'
```

### Get All Orders
```bash
curl http://localhost:3000/api/orders?page=1&limit=10&status=pending
```

## Development

- The application uses Sequelize ORM for database operations
- All routes are documented with Swagger annotations
- Environment variables are managed through dotenv
- Nodemon is configured for development auto-restart

## API Documentation

Once the server is running, visit `http://localhost:3000/api-docs` to view the interactive Swagger documentation.
