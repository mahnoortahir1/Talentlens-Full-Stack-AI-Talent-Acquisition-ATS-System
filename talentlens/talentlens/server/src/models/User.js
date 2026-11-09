import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['recruiter', 'candidate'], required: true, index: true },
    company: { type: String, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return { id: this._id, name: this.name, email: this.email, role: this.role, company: this.company };
};

export default mongoose.model('User', userSchema);
