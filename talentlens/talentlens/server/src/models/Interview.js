import mongoose from 'mongoose';

const { Schema } = mongoose;

const interviewSchema = new Schema(
  {
    application: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scheduledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    interviewer: { name: { type: String, required: true }, email: { type: String, lowercase: true } },
    type: { type: String, enum: ['phone', 'video', 'onsite', 'technical', 'hr'], default: 'video' },
    start: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 45, min: 15, max: 480 },
    locationOrLink: String,
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
    feedback: {
      ratings: { technical: Number, communication: Number, problemSolving: Number, roleFit: Number },
      strengths: String,
      concerns: String,
      recommendation: { type: String, enum: ['strong_yes', 'yes', 'no', 'strong_no'] },
      submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      submittedAt: Date,
    },
  },
  { timestamps: true }
);

interviewSchema.virtual('end').get(function end() {
  return new Date(this.start.getTime() + this.durationMinutes * 60000);
});
interviewSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Interview', interviewSchema);
