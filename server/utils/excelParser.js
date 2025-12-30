const XLSX = require('xlsx');
const path = require('path');
const bcrypt = require('bcryptjs');

exports.parseExamineesExcel = async (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(worksheet);

    const requiredColumns = ['firstname', 'lastname', 'username', 'password'];
    const validatedData = [];
    const errors = [];

    for (let index = 0; index < data.length; index++) {
      const row = data[index];

      const missingFields = requiredColumns.filter(col => !row[col]);

      if (missingFields.length > 0) {
        errors.push({
          row: index + 2,
          message: `Missing fields: ${missingFields.join(', ')}`
        });
        continue;
      }

      const hashedPassword = await bcrypt.hash(
        String(row.password).trim(),
        12
      );

      validatedData.push({
        firstname: String(row.firstname).trim(),
        lastname: String(row.lastname).trim(),
        username: String(row.username).trim().toLowerCase(),
        password: hashedPassword, // ✅ FIXED
        email: row.email
          ? String(row.email).trim().toLowerCase()
          : undefined
      });
    }

    return {
      success: errors.length === 0,
      data: validatedData,
      errors
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      errors: [{ message: `Failed to parse Excel file: ${error.message}` }]
    };
  }
};

// stable version of parseQuestionsExcel below
// exports.parseQuestionsExcel = (filePath) => {
//   try {
//     const workbook = XLSX.readFile(filePath);
//     const sheetName = workbook.SheetNames[0];
//     const worksheet = workbook.Sheets[sheetName];

//     const data = XLSX.utils.sheet_to_json(worksheet);

//     const validatedData = [];
//     const errors = [];

//     data.forEach((row, index) => {
//       // Required fields
//       if (!row.type || !row.question || row.credit === undefined) {
//         errors.push({
//           row: index + 2,
//           message: 'Missing required fields: type, question, or credit'
//         });
//         return;
//       }

//       const type = String(row.type).trim().toLowerCase();

//       if (!['mcq', 'theory'].includes(type)) {
//         errors.push({
//           row: index + 2,
//           message: 'Type must be either "mcq" or "theory"'
//         });
//         return;
//       }

//       const question = {
//         type,
//         question: String(row.question).trim(),
//         credit: Number(row.credit),
//         topic: row.topic ? String(row.topic).trim() : 'General',
//         difficulty: row.difficulty ? String(row.difficulty).trim().toLowerCase() : 'medium'
//       };

//       // MCQ specific validation
//       if (type === 'mcq') {
//         if (!row.options) {
//           errors.push({
//             row: index + 2,
//             message: 'MCQ must have options'
//           });
//           return;
//         }

//         // Parse options (expecting pipe-separated: "Option A|Option B|Option C|Option D")
//         const options = String(row.options).split('|').map(opt => opt.trim());

//         if (options.length < 2) {
//           errors.push({
//             row: index + 2,
//             message: 'MCQ must have at least 2 options'
//           });
//           return;
//         }

//         if (row.correctOption === undefined) {
//           errors.push({
//             row: index + 2,
//             message: 'MCQ must have correctOption (0-based index)'
//           });
//           return;
//         }

//         const correctOption = Number(row.correctOption);

//         if (correctOption < 0 || correctOption >= options.length) {
//           errors.push({
//             row: index + 2,
//             message: 'correctOption index is out of range'
//           });
//           return;
//         }

//         question.options = options;
//         question.correctOption = correctOption;
//       }

//       validatedData.push(question);
//     });

//     return {
//       success: errors.length === 0,
//       data: validatedData,
//       errors
//     };
//   } catch (error) {
//     return {
//       success: false,
//       data: [],
//       errors: [{ message: `Failed to parse Excel file: ${error.message}` }]
//     };
//   }
// };

exports.parseQuestionsExcel = (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Keep empty cells (important!)
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const validatedData = [];
    const errors = [];

    data.forEach((row, index) => {
      const rowNumber = index + 2;

      // ---------- REQUIRED ----------
      if (!row.type || !row.question || row.credit === '') {
        errors.push({
          row: rowNumber,
          message: 'Missing required fields: type, question, or credit'
        });
        return;
      }

      const type = String(row.type).trim().toLowerCase();
      if (!['mcq', 'theory'].includes(type)) {
        errors.push({
          row: rowNumber,
          message: 'Type must be mcq or theory'
        });
        return;
      }

      const question = {
        type,
        question: String(row.question).trim(),
        credit: Number(row.credit),
        topic: row.topic ? String(row.topic).trim() : 'General',
        difficulty: row.difficulty
          ? String(row.difficulty).trim().toLowerCase()
          : 'medium'
      };

      // ---------- MCQ LOGIC ----------
      if (type === 'mcq') {
        // Collect option columns dynamically
        const options = Object.keys(row)
          .filter(key => key.toLowerCase().startsWith('option'))
          .map(key => String(row[key]).trim())
          .filter(Boolean);

        if (options.length < 2) {
          errors.push({
            row: rowNumber,
            message: 'MCQ must have at least 2 options'
          });
          return;
        }

        if (row.correctOption === '') {
          errors.push({
            row: rowNumber,
            message: 'MCQ must have correctOption (1-based index)'
          });
          return;
        }

        // Excel → JS index conversion (1 → 0)
        const correctIndex = Number(row.correctOption) - 1;

        if (
          Number.isNaN(correctIndex) ||
          correctIndex < 0 ||
          correctIndex >= options.length
        ) {
          errors.push({
            row: rowNumber,
            message: `correctOption must be between 1 and ${options.length}`
          });
          return;
        }

        question.options = options;
        question.correctOption = correctIndex;
      }

      validatedData.push(question);
    });

    return {
      success: errors.length === 0,
      data: validatedData,
      errors
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      errors: [{ message: `Failed to parse Excel file: ${error.message}` }]
    };
  }
};