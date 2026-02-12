"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionValueEvent,
  MotionValue,
  AnimatePresence,
} from "framer-motion";
import { Check } from "lucide-react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Balanced spring for "buttery smooth" progress filling
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 40,
    restDelta: 0.001,
  });

  useMotionValueEvent(scrollYProgress, "change", (latest: number) => {
    if (latest <= 0.33) setActiveStep(0);
    else if (latest > 0.33 && latest <= 0.66) setActiveStep(1);
    else setActiveStep(2);
  });

  return (
    <section id="how-it-works" className={styles.steps}>
      <div ref={containerRef} className={styles.scrollWrapper}>
        <div className={styles.stickyContainer}>
          <div className={styles.stepsInner}>
            {/* Header stays at top */}
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                Launch in minutes, not months
              </h2>
              <p className={styles.sectionDesc}>
                Three simple steps to start selling
              </p>
            </div>

            {/* Description is now the CENTERpiece */}
            <div className={styles.descContainer}>
              <AnimatePresence mode="wait">
                <motion.p
                  key={activeStep}
                  initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -30, filter: "blur(10px)" }}
                  transition={{
                    duration: 0.8,
                    ease: [0.22, 1, 0.36, 1], // Quentin ease for smoothness
                  }}
                >
                  {STEPS[activeStep].description}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Timeline is now at the BOTTOM */}
            <div className={styles.timelineContainer}>
              <div className={styles.progressTrack}>
                <motion.div
                  className={styles.progressBar}
                  style={{ scaleX, originX: 0 }}
                />
              </div>

              <div className={styles.stepsList}>
                {STEPS.map((step, index) => {
                  const threshold = index / (STEPS.length - 1);
                  return (
                    <StepItem
                      key={step.number}
                      step={step}
                      index={index}
                      progress={scrollYProgress}
                      threshold={threshold}
                      activeStep={activeStep}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface StepItemProps {
  step: (typeof STEPS)[0];
  index: number;
  progress: MotionValue<number>;
  threshold: number;
  activeStep: number;
}

function StepItem({
  step,
  index,
  progress,
  threshold,
  activeStep,
}: StepItemProps) {
  const isCompletedVal = useTransform(
    progress,
    (v: number) => v > threshold + 0.1,
  );
  const [isCompleted, setIsCompleted] = useState(false);

  useMotionValueEvent(isCompletedVal, "change", (latest: boolean) => {
    setIsCompleted(latest);
  });

  return (
    <div className={styles.stepWrapper}>
      <motion.div
        className={`${styles.marker} ${activeStep === index ? styles.active : ""} ${isCompleted ? styles.completed : ""}`}
        style={{
          scale: activeStep === index ? 1.15 : 1,
          boxShadow:
            activeStep === index
              ? "0 10px 30px rgba(0,0,0,0.15)"
              : "0 0 0 rgba(0,0,0,0)",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {isCompleted ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <Check size={20} strokeWidth={3} className={styles.checkIcon} />
          </motion.div>
        ) : (
          <span>{step.number}</span>
        )}
      </motion.div>

      <div className={styles.stepLabel}>
        <span className={styles.stepNumberLabel}>Step {step.number}</span>
        <span className={styles.stepTitle}>{step.title}</span>
      </div>
    </div>
  );
}
