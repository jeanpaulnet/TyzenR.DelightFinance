using Microsoft.EntityFrameworkCore;
using DelightFinance.Controllers; // Assuming entities are in this namespace as per the controller file

namespace DelightFinance.Data
{
    public class DelightFinanceContext : DbContext
    {
        public DelightFinanceContext(DbContextOptions<DelightFinanceContext> options)
            : base(options)
        {
        }

        public DbSet<BusinessEntity> Business { get; set; }
        public DbSet<TransactionEntity> Transaction { get; set; }
        public DbSet<CategoryEntity> Category { get; set; }
        public DbSet<ImportRuleEntity> ImportRule { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // BusinessEntity Configuration
            modelBuilder.Entity<BusinessEntity>(entity =>
            {
                entity.ToTable("Business");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).IsRequired().HasMaxLength(255);
                entity.Property(e => e.BusinessSettingsJson).IsRequired();
                entity.Property(e => e.UserId).IsRequired();
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
                entity.Property(e => e.UpdatedAt).HasDefaultValueSql("GETUTCDATE()");
                
                // Indices for common queries
                entity.HasIndex(e => e.UserId);
            });

            // TransactionEntity Configuration
            modelBuilder.Entity<TransactionEntity>(entity =>
            {
                entity.ToTable("Transaction");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Amount).HasPrecision(18, 2);
                entity.Property(e => e.Deductions).HasPrecision(18, 2);
                entity.Property(e => e.FinalAmount).HasPrecision(18, 2);
                entity.Property(e => e.Description).HasMaxLength(500);
                entity.Property(e => e.UserId).IsRequired();
                entity.Property(e => e.CategoryId).IsRequired();
                
                // Relational Links
                entity.HasOne<BusinessEntity>()
                      .WithMany()
                      .HasForeignKey(e => e.BusinessId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(e => e.BusinessId);
                entity.HasIndex(e => e.UserId);
                entity.HasIndex(e => e.CategoryId);
                entity.HasIndex(e => e.Date);
            });

            // CategoryEntity Configuration (Budgets)
            modelBuilder.Entity<CategoryEntity>(entity =>
            {
                entity.ToTable("Category");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
                entity.Property(e => e.Amount).HasPrecision(18, 2);
                entity.Property(e => e.Type).IsRequired().HasMaxLength(20);
                entity.Property(e => e.UserId).IsRequired();
                
                entity.HasOne<BusinessEntity>()
                      .WithMany()
                      .HasForeignKey(e => e.BusinessId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(e => e.BusinessId);
                entity.HasIndex(e => e.UserId);
            });

            // ImportRuleEntity Configuration
            modelBuilder.Entity<ImportRuleEntity>(entity =>
            {
                entity.ToTable("ImportRule");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Keyword).IsRequired().HasMaxLength(255);
                entity.Property(e => e.Category).IsRequired().HasMaxLength(100);
                entity.Property(e => e.UserId).IsRequired();

                entity.HasOne<BusinessEntity>()
                      .WithMany()
                      .HasForeignKey(e => e.BusinessId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(e => e.BusinessId);
                entity.HasIndex(e => e.UserId);
            });
        }
    }
}
