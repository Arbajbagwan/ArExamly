const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

// Load env vars
dotenv.config();

// Connect to DB
// FIX: Removed { useNewUrlParser: true, useUnifiedTopology: true } 
// as they are no longer supported in Mongoose 6+
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected...'))
  .catch(err => {
    console.error('MongoDB Connection Error:', err.message);
    process.exit(1);
  });

const importData = async () => {
  try {
    // Optional: Clear existing users to start fresh
    // await User.deleteMany(); 
    // console.log('Data Destroyed...');

    // Check if admin already exists
    const adminExists = await User.findOne({ username: 'admin' });
    
    if (adminExists) {
        console.log('Admin user already exists!');
        process.exit();
    }

    // Create Admin User
    const adminUser = new User({
      firstname: 'System',
      lastname: 'Admin',
      username: 'admin',
      email: 'admin@example.com',
      password: 'password123', // Default password
      role: 'admin',
      isActive: true
    });

    await adminUser.save();

    console.log('✅ Admin User Created Successfully!');
    console.log('Username: admin');
    console.log('Password: password123');
    
    process.exit();
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

importData();