import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <section className={styles.notFoundContainer}>
      <div className={styles.contentWrapper}>
        <div className={styles.textCenter}>
          {/* 404 Animation Background */}
          <div
            className={styles.imageContainer}
            style={{
              backgroundImage:
                "url(https://cdn.dribbble.com/users/285475/screenshots/2083086/dribbble_1.gif)",
            }}
          >
            <h1 className={styles.heading404}>404</h1>
          </div>

          {/* Error Message */}
          <div className={styles.errorContent}>
            <h3 className={styles.errorTitle}>
              Looks like you&apos;re lost
            </h3>

            <p className={styles.errorDescription}>
              The page you are looking for is not available!
            </p>

            <Link href="/" className={styles.homeButton}>
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
