import mongoose from 'mongoose';

// Original uploaded files (≤5 MB, well under MongoDB's 16 MB document limit).
const resumeFileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fileName: String,
    mimeType: String,
    size: Number,
    data: Buffer,
  },
  { timestamps: true }
);

export default mongoose.model('ResumeFile', resumeFileSchema);
