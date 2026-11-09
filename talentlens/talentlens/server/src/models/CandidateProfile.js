import mongoose from 'mongoose';

const { Schema } = mongoose;

const skillSchema = new Schema({ name: String, evidence: [String], mentions: Number, source: { type: String, default: 'parser' }, usedInContext: Boolean }, { _id: false });

const profileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    headline: { type: String, maxlength: 140 },
    phone: { type: String, maxlength: 40 },
    location: { type: String, maxlength: 120 },
    interests: [{ type: String, maxlength: 60 }],
    talentPoolConsent: { type: Boolean, default: true },

    resume: {
      fileId: { type: Schema.Types.ObjectId, ref: 'ResumeFile' },
      fileName: String,
      mimeType: String,
      size: Number,
      uploadedAt: Date,
      status: { type: String, enum: ['none', 'parsed', 'empty', 'failed'], default: 'none' },
      error: String,
      text: { type: String, select: false },
    },

    parsed: {
      name: String,
      email: String,
      phone: String,
      links: [String],
      summary: String,
      skills: [skillSchema],
      education: [{ _id: false, degree: String, level: Number, field: String, institution: String, year: Number, text: String }],
      experience: [{ _id: false, title: String, company: String, start: Date, end: Date, months: Number, details: [String], text: String }],
      totalExperienceYears: Number,
      projects: [{ _id: false, name: String, description: String, skills: [String] }],
      sanitizedText: { type: String, select: false },
      warnings: [String],
      protectedLinesRemoved: Number,
    },

    // Corrections made by the candidate or a recruiter; applied on top of parser output.
    skillCorrections: [{ _id: false, name: String, action: { type: String, enum: ['add', 'remove'] }, by: { type: String, enum: ['candidate', 'recruiter'] }, evidence: String, at: { type: Date, default: Date.now } }],
    declaredAbsent: [String], // skills the candidate explicitly says they do NOT have
    experienceYearsOverride: { type: Number, min: 0, max: 60 },

    embedding: { type: [Number], select: false },
    embeddingModel: String,
    chunks: { type: [{ _id: false, section: String, text: String, embedding: [Number] }], select: false },

    mergedInto: { type: Schema.Types.ObjectId, ref: 'CandidateProfile', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('CandidateProfile', profileSchema);
