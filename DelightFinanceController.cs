using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace DelightFinance.Controllers
{
    // --- Business Settings ---
    // Entity suffix as per previous request
    public class BusinessSettingsEntity
    {
        public string Currency { get; set; } = "USD";
        public string Timezone { get; set; } = "UTC";
        public bool IsBudgetingEnabled { get; set; } = true;
        public bool IsGstEnabled { get; set; } = false;
        public string? FiscalYearStart { get; set; } = "01-01";
        public string? FiscalYearEnd { get; set; } = "12-31";
    }

    // --- Core Entities ---
    public class BusinessEntity
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsDefault { get; set; }
        public string BusinessSettingsJson { get; set; } = "{}";

        [System.ComponentModel.DataAnnotations.Schema.NotMapped]
        public BusinessSettingsEntity BusinessSettings 
        { 
            get => JsonSerializer.Deserialize<BusinessSettingsEntity>(BusinessSettingsJson ?? "{}") ?? new BusinessSettingsEntity();
            set => BusinessSettingsJson = JsonSerializer.Serialize(value);
        }
        
        public Guid UserId { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public bool IsDeleted { get; set; }
    }

    public class TransactionEntity
    {
        public Guid Id { get; set; }
        public decimal Amount { get; set; }
        public decimal Deductions { get; set; }
        public decimal FinalAmount { get; set; }
        public Guid CategoryId { get; set; }
        public string Description { get; set; } = string.Empty;
        public DateTime Date { get; set; }
        public string? Notes { get; set; }
        public Guid BusinessId { get; set; }
        public Guid UserId { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class CategoryEntity
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string Type { get; set; } = "Expense";
        public decimal GstRate { get; set; }
        public int Month { get; set; }
        public int Year { get; set; }
        public Guid BusinessId { get; set; }
        public Guid UserId { get; set; }
    }

    public class ImportRuleEntity
    {
        public Guid Id { get; set; }
        public string Keyword { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public Guid BusinessId { get; set; }
        public Guid UserId { get; set; }
    }

    // --- DTOs ---
    public class BusinessSettingsDto
    {
        public string Currency { get; set; } = "USD";
        public string Timezone { get; set; } = "UTC";
        public bool IsBudgetingEnabled { get; set; } = true;
        public bool IsGstEnabled { get; set; } = false;
        public string? FiscalYearStart { get; set; } = "01-01";
        public string? FiscalYearEnd { get; set; } = "12-31";
    }

    public class SaveBusinessRequestDto
    {
        public string Name { get; set; } = string.Empty;
        public bool IsDefault { get; set; }
        public Guid UserId { get; set; }
        public string UserEmail { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public BusinessSettingsDto Settings { get; set; } = new BusinessSettingsDto();
    }

    public class SaveTransactionRequestDto
    {
        public decimal Amount { get; set; }
        public decimal Deductions { get; set; }
        public decimal FinalAmount { get; set; }
        public Guid CategoryId { get; set; }
        public string Description { get; set; } = string.Empty;
        public DateTime Date { get; set; }
        public string? Notes { get; set; }
        public Guid BusinessId { get; set; }
    }

    // --- Controller ---
    [ApiController]
    [Route("api/[controller]")]
    public class DelightFinanceController : ControllerBase
    {
        // Logic: Extracting user context from Request Headers.
        protected Guid CurrentUserId => Guid.TryParse(Request.Headers["X-User-Id"].ToString(), out var guid) ? guid : Guid.Empty;
        protected string CurrentUserName => Request.Headers["X-User-Name"].ToString() ?? "Delight User";
        protected string CurrentUserEmail => Request.Headers["X-User-Email"].ToString() ?? "";

        // BUSINESS & SETTINGS
        [HttpGet("/delight/businesses")] // Note: Mapping to external path if base is different
        [HttpGet("businesses")]
        public IActionResult ListBusinesses()
        {
            // Logic: Filter by CurrentUserId in DB
            return Ok(new List<BusinessEntity>());
        }

        [HttpPost("business")]
        public IActionResult CreateBusiness([FromBody] SaveBusinessRequestDto request)
        {
            var business = new BusinessEntity
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                IsDefault = request.IsDefault,
                BusinessSettingsJson = JsonSerializer.Serialize(request.Settings),
                UserId = request.UserId != Guid.Empty ? request.UserId : CurrentUserId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            
            return Ok(business);
        }

        [HttpGet("business/{id}")]
        public IActionResult GetBusiness(Guid id)
        {
            var business = new BusinessEntity 
            { 
                Id = id, 
                Name = "Delightful Enterprise",
                UserId = CurrentUserId
            };
            return Ok(business);
        }

        [HttpPut("business/{id}")]
        public IActionResult UpdateBusiness(Guid id, [FromBody] SaveBusinessRequestDto request)
        {
            // Logic: Update BusinessSettingsJson in DB for CurrentUserId
            return Ok(new { Message = "Business and Settings updated successfully", User = CurrentUserName });
        }

        [HttpDelete("business/{id}")]
        public IActionResult DeleteBusiness(Guid id)
        {
            // Logic: Soft delete for CurrentUserId
            return Ok(new { Message = "Profile deleted", Email = CurrentUserEmail });
        }

        // TRANSACTIONS
        [HttpPost("transaction")]
        public IActionResult SaveTransaction([FromBody] SaveTransactionRequestDto request)
        {
            var transaction = new TransactionEntity
            {
                Id = Guid.NewGuid(),
                Amount = request.Amount,
                Deductions = request.Deductions,
                FinalAmount = request.FinalAmount,
                CategoryId = request.CategoryId,
                Description = request.Description,
                Date = request.Date,
                Notes = request.Notes,
                BusinessId = request.BusinessId,
                UserId = CurrentUserId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            return Ok(transaction);
        }

        // BUDGETS & CATEGORIES
        [HttpGet("business/{businessId}/categories")]
        public IActionResult GetBusinessCategories(Guid businessId)
        {
            // Logic: Filter by CurrentUserId
            return Ok(new List<CategoryEntity>());
        }

        // RULES
        [HttpPost("rule")]
        public IActionResult SaveImportRule([FromBody] ImportRuleEntity rule)
        {
            rule.Id = Guid.NewGuid();
            rule.UserId = CurrentUserId;
            return Ok(rule);
        }
    }
}
