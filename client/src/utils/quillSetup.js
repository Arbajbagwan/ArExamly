import ReactQuill, { Quill } from "react-quill-new";
import katex from "katex";
import "katex/dist/katex.min.css";

// ✅ Ensure katex is on window FIRST
if (typeof window !== "undefined") {
  window.katex = katex;
}

// ✅ Custom Formula Blot
const Embed = Quill.import("blots/embed");

class FormulaBlot extends Embed {
  static blotName = "formula";
  static tagName = "SPAN";
  static className = "ql-formula";

  static create(value) {
    const node = super.create(value);
    if (typeof value === "string") {
      window.katex.render(value, node, {
        throwOnError: false,
        errorColor: "#f00",
      });
      node.setAttribute("data-value", value);
    }
    return node;
  }

  static value(node) {
    return node.getAttribute("data-value");
  }
}

// ✅ Register the custom formula blot
Quill.register(FormulaBlot, true);

export { ReactQuill, Quill, katex };