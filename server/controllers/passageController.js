const Passage = require('../models/Passage');

const ownerFilter = (req, filter = {}) => {
  if (req.user.role === 'superuser') return { ...filter, createdBy: req.user._id };
  return filter;
};

exports.getPassages = async (req, res, next) => {
  try {
    const passages = await Passage.find(ownerFilter(req, { isActive: true })).sort('-createdAt');
    res.status(200).json({ success: true, passages });
  } catch (err) {
    next(err);
  }
};

exports.createPassage = async (req, res, next) => {
  try {
    const { title, text, topic, complexity, marksLabel } = req.body;
    if (!title || !text) {
      return res.status(400).json({ success: false, message: 'Title and text are required' });
    }
    const passage = await Passage.create({
      title: title.trim(),
      text: text.trim(),
      topic: topic?.trim() || '',
      complexity: complexity || 'simple',
      marksLabel: marksLabel?.trim() || '',
      createdBy: req.user._id
    });
    res.status(201).json({ success: true, passage });
  } catch (err) {
    next(err);
  }
};
