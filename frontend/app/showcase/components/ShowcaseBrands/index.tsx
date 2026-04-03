import styles from "./ShowcaseBrands.module.css";

export default function ShowcaseBrands() {
  return (
    <section className={styles.brandsSection}>
      <div className={styles.brandsContainer}>
        {/* Rakuten */}
        <div className={styles.brandLogo}>
          <span style={{ fontWeight: 800, fontSize: "24px", letterSpacing: "-1px" }}>Rakuten</span>
        </div>
        
        {/* NCR */}
        <div className={styles.brandLogo}>
          <div className={styles.ncrLogo}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22v-9" />
              <path d="M15.17 2.38A7 7 0 0 0 7.83 22" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span style={{ fontWeight: 900, fontSize: "20px" }}>NCR</span>
          </div>
        </div>

        {/* monday.com */}
        <div className={styles.brandLogo}>
          <div className={styles.mondayLogo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h4v8H3v-8zm8-6h4v14h-4V7zm8 6h4v8h-4v-8z" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: "22px", letterSpacing: "-1px" }}>monday<span style={{fontWeight: 400}}>.com</span></span>
          </div>
        </div>

        {/* Disney */}
        <div className={styles.brandLogo}>
          <span style={{ fontFamily: "cursive", fontSize: "32px", fontWeight: 700 }}>Disney</span>
        </div>

        {/* Dropbox */}
        <div className={styles.brandLogo}>
          <div className={styles.dropboxLogo}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4 7l8 5 8-5-8-5zm0 10l-8-5-8 5 8 5 8-5z" />
            </svg>
            <span style={{ fontWeight: 700, fontSize: "22px", letterSpacing: "-1px" }}>Dropbox</span>
          </div>
        </div>
      </div>
    </section>
  );
}
