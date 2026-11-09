import mongoose from 'mongoose';

const { Schema } = mongoose;

export const STATUSES = ['submitted', 'parsed', 'ai_assessed', 'recruiter_review', 'shortlisted', 'rejected', 'interview', 'selected'];

// Allowed manual transitions. Automatic ones (submitted -> parsed -> ai_assessed) are done by the system.
export const TRANSITIONS = {
  submitted: ['recruiter_review', 'rejected'],
  parsed: ['recruiter_review', 'rejected'],
  ai_assessed: ['recruiter_review', 'shortlisted', 'rejected'],
  recruiter_review: ['shortlisted', 'rejected'],
  shortlisted: ['interview', 'rejected', 'recruiter_review'],
  interview: ['selected', 'rejected'],
  rejected: ['recruiter_review'], // allow reconsideration (audited)
  selected: [],
};

const applicationSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    profile: { type: Schema.Types.ObjectId, ref: 'CandidateProfile', required: true },
    coverNote: { type: String, maxlength: 2000 },
    status: { type: String, enum: STATUSES, default: 'submitted', index: true },

    assessment: { type: Schema.Types.Mixed, default: null },
    assessedAt: Date,
    override: { score: Number, reason: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, at: Date },
    recruiterAbsent: [String], // skills a recruiter confirmed the candidate lacks for this application
    fairness: { type: Schema.Types.Mixed, default: null },

    notes: [{ author: { type: Schema.Types.ObjectId, ref: 'User' }, authorName: String, text: { type: String, maxlength: 2000 }, at: { type: Date, default: Date.now } }],
    history: [{ _id: false, from: String, to: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, byName: String, note: String, at: { type: Date, default: Date.now } }],
    questions: [{ _id: false, id: String, text: String, difficulty: String, type: { type: String }, skill: String, projectRef: String, guideline: String, source: String, flagged: Boolean, flagReason: String, edited: Boolean }],
    // Texts of every question generated so far, so Regenerate never repeats an earlier set.
    previousQuestions: { type: [String], default: [] },
    decision: { outcome: { type: String, enum: ['selected', 'rejected'] }, by: { type: Schema.Types.ObjectId, ref: 'User' }, at: Date, reason: String },
    decidedAt: Date, // first shortlist/reject decision, used for processing-time analytics
  },
  { timestamps: true }
);

applicationSchema.index({ job: 1, candidate: 1 }, { unique: true });

/** Fields a candidate may see about their own application. */
applicationSchema.methods.toCandidateJSON = function toCandidateJSON() {
  const visible = { recruiter_review: 'under_review', ai_assessed: 'under_review', parsed: 'submitted' };
  return {
    id: this._id,
    job: this.job,
    status: visible[this.status] || this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    timeline: this.history.map((h) => ({ status: visible[h.to] || h.to, at: h.at })).filter((h, i, arr) => i === 0 || h.status !== arr[i - 1].status),
  };
};

export default mongoose.model('Application', applicationSchema);
