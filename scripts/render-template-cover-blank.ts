import Automizer from "pptx-automizer";
import path from "path";
import { coverApplicator } from "../src/lib/pptx-template/applicators/cover";
import type { ApplicatorContext } from "../src/lib/pptx-template/types";

const TEMPLATE_DIR = path.resolve("templates");
const TEMPLATE_FILE = "anbudsmall-v2.pptx";
const OUT_DIR = path.resolve("tmp");
const OUT_FILE = "anbudsmall-v2-blank-cover.pptx";

async function main() {
  const automizer = new Automizer({
    templateDir: TEMPLATE_DIR,
    outputDir: OUT_DIR,
    removeExistingSlides: true,
  });

  const pres = automizer.loadRoot(TEMPLATE_FILE).load(TEMPLATE_FILE, "main");

  const ctx: ApplicatorContext = {
    sections: [],
    master: {
      companyName: "",
      clientName: "",
      bidName: "",
      diaryNumber: "",
      bidDate: "",
    },
    slideNum: 1,
    totalSlides: 1,
    sourceSlide: 1,
  };

  pres.addSlide("main", 1, coverApplicator(ctx));

  await pres.write(OUT_FILE);
  console.log(`Generated: ${path.join(OUT_DIR, OUT_FILE)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
