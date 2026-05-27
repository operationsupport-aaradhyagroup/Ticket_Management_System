import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error('MONGODB_URI is not configured.');
}

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['User', 'Admin'], default: 'User' },
  departmentId: { type: String, default: '' }
});

const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);

async function main() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 4000 });

  const passwordHash = await bcrypt.hash('Aaradhya@123', 10);

  await UserModel.updateOne(
    { email: 'aaradhya.admin@company.com' },
    {
      $set: {
        email: 'aaradhya.admin@company.com',
        name: 'Aaradhya Group Admin',
        passwordHash,
        role: 'Admin',
        departmentId: 'dept-admin'
      }
    },
    { upsert: true }
  );

  const savedUser = await UserModel.findOne(
    { email: 'aaradhya.admin@company.com' },
    { email: 1, name: 1, role: 1, departmentId: 1 }
  ).lean();

  console.log(JSON.stringify(savedUser));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
