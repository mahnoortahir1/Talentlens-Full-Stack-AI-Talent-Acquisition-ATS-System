import mongoose from 'mongoose';

const { Schema } = mongoose;
const reqSkill = new Schema({ name: { type: String, required: true }, importance: { type: Number, min: 1, max: 5, default: 3 } }, { _id: false });

const jobSchema = new Schema(
  {
    recruiter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    department: { type: String, trim: true, maxlength: 80 },
    location: { type: String, trim: true, maxlength: 120 },
    type: { type: String, enum: ['full-time', 'part-time', 'contract', 'internship', 'remote'], default: 'full-time' },
    salaryMin: Number,
    salaryMax: Number,
    currency: { type: String, default: 'PKR', maxlength: 5 },
    description: { type: String, required: true, maxlength: 10000 },
    requiredSkills: [reqSkill],
    preferredSkills: [reqSkill],
    minExperienceYears: { type: Number, default: 0, min: 0, max: 40 },
    qualifications: [String],
    weights: {
      skills: { type: Number, default: 50 },
      experience: { type: Number, default: 25 },
      projects: { type: Number, default: 15 },
      qualifications: { type: Number, default: 10 },
    },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    embedding: { type: [Number], select: false },
    closedAt: Date,
  },
  { timestamps: true }
);

jobSchema.index({ title: 'text', description: 'text' });

export default mongoose.model('Job', jobSchema);
