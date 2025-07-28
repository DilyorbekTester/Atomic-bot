const mongoose = require("mongoose")

const systemSettingsSchema = new mongoose.Schema(
  {
    // Akademiya
    academyName: {
      type: String,
      default: "O'quv Markazi",
    },
    academyLocation: {
      type: String,
      default: "",
    },
    academyPhone: {
      type: String,
      default: "",
    },

    // Ijtimoiy tarmoqlar
    socialMedia: {
      instagram: { type: String, default: "" },
      telegram: { type: String, default: "" },
      facebook: { type: String, default: "" },
      youtube: { type: String, default: "" },
    },

    // Oxirgi yangilanish
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Faollik
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

systemSettingsSchema.statics.getInstance = async function () {
  let settings = await this.findOne({ isActive: true })
  if (!settings) {
    settings = await this.create({
      academyName: "O'quv Markazi",
      academyLocation: "",
      academyPhone: "",
    })
  }
  return settings
}

// Yangilash metodi
systemSettingsSchema.methods.updateSettings = async function (updates, userId) {
  Object.keys(updates).forEach((key) => {
    if (updates[key] !== undefined) {
      this[key] = updates[key]
    }
  })
  this.lastUpdated = new Date()
  this.updatedBy = userId
  return await this.save()
}

module.exports = mongoose.model("SystemSettings", systemSettingsSchema)
