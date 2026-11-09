import mongoose from 'mongoose';

// Simulated notifications (in-app inbox instead of real email/SMS).
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    body: String,
    link: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Notification', notificationSchema);
