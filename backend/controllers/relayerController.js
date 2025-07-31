import relayerService from '../services/relayerService.js';
import { handleServiceError } from '../utils/errorHandler.js';
// Get relayer status
const getRelayerStatus = async (req, res) => {
  try {
    const result = await relayerService.getRelayerStatus();
    res.json(result.data);
  } catch (error) {
    handleServiceError(error, res);
  }
};

// Get relayer statistics
const getRelayerStats = async (req, res) => {
  try {
    const result = await relayerService.getRelayerStats();
    res.json(result.data);
  } catch (error) {
    handleServiceError(error, res);
  }
};

// Process order
const processOrder = async (req, res) => {
  try {
    const result = await relayerService.processOrder(req.params.orderId);
    res.json(result.data);
  } catch (error) {
    handleServiceError(error, res);
  }
};

// Get order processing status
const getOrderProcessingStatus = async (req, res) => {
  try {
    const result = await relayerService.getOrderProcessingStatus(req.params.orderId);
    res.json(result.data);
  } catch (error) {
    handleServiceError(error, res);
  }
};

export {
  getRelayerStatus,
  getRelayerStats,
  processOrder,
  getOrderProcessingStatus
};
