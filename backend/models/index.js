const { sequelize } = require('../config/database');
const Order = require('./Order');

// Define associations here if needed in the future
// Order.belongsTo(User, { foreignKey: 'userId' });

const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Database tables synchronized successfully.');
  } catch (error) {
    console.error('Error synchronizing database tables:', error);
  }
};

module.exports = {
  sequelize,
  Order,
  syncDatabase
};
