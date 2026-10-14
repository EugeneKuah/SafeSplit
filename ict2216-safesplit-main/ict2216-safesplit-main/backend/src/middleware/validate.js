function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid request input',
        details: result.error.issues.map((issue) => issue.message)
      });
    }
    req.validatedBody = result.data;
    return next();
  };
}

module.exports = { validate };
