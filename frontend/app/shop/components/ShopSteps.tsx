import styles from "./ShopSteps.module.css";

const STEPS = [
  {
    number: "1",
    title: "Sign up",
    description:
      "Create your account in seconds. No credit card required to get started.",
  },
  {
    number: "2",
    title: "Add products",
    description:
      "Import your catalog via CSV, API, or manual entry. Bulk operations supported.",
  },
  {
    number: "3",
    title: "Start selling",
    description:
      "Go live immediately. Orders, payments, and fulfillment handled automatically.",
  },
];

export default function ShopSteps() {
  return (
    <section id="how-it-works" className={styles.steps}>
      <div className={styles.stepsInner}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Launch in minutes, not months</h2>
          <p className={styles.sectionDesc}>
            Three simple steps to start selling
          </p>
        </div>

        <div className={styles.stepsGrid}>
          {STEPS.map((step) => (
            <div key={step.number} className={styles.stepCard}>
              <div className={styles.stepNumber}>{step.number}</div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
