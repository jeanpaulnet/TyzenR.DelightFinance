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
        public string? Type { get; set; } = "Personal";
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
        public decimal Budget { get; set; }
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
        public string? Type { get; set; } = "Personal";
    }

    public class SaveBusinessDto
    {
        public Guid? Id { get; set; }
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
    [Route("delight")]
    public class DelightFinanceController : ControllerBase
    {
        // Logic: Assuming the context is injected via a field (using the name from user's snippet)
        // private readonly YourDbContext delightFinanceContext; 

        // Logic: Extracting user context from Request Headers.
        protected Guid CurrentUserId => Guid.TryParse(Request.Headers["UserId"].ToString(), out var guid) ? guid : Guid.Empty;
        protected string CurrentUserName => Request.Headers["UserName"].ToString() ?? "Delight User";
        protected string CurrentUserEmail => Request.Headers["UserEmail"].ToString() ?? "";

        // BUSINESS & SETTINGS
        [HttpGet("businesses")]
        public IActionResult ListBusinesses()
        {
            // Logic: Filter by CurrentUserId in DB
            return Ok(new List<BusinessEntity>());
        }

        [HttpPost("business")]
        public async Task<IActionResult> SaveBusinessAsync([FromBody] SaveBusinessDto request)
        {
            try
            {
                if (request.Id.HasValue && request.Id.Value != Guid.Empty)
                {
                    // Update Logic
                    // var business = await delightFinanceContext.Businesses.FirstOrDefaultAsync(b => b.Id == request.Id.Value && b.UserId == CurrentUserId);
                    // if (business == null) return NotFound();
                    
                    // business.Name = request.Name;
                    // business.IsDefault = request.IsDefault;
                    // business.BusinessSettingsJson = JsonSerializer.Serialize(request.Settings);
                    // business.UpdatedAt = DateTime.UtcNow;
                    // await delightFinanceContext.SaveChangesAsync();

                    return Ok(new BusinessEntity {
                        Id = request.Id.Value,
                        Name = request.Name,
                        IsDefault = request.IsDefault,
                        BusinessSettingsJson = JsonSerializer.Serialize(request.Settings),
                        UserId = request.UserId != Guid.Empty ? request.UserId : CurrentUserId,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
                else
                {
                    // Create Logic
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

                    // await delightFinanceContext.Businesses.AddAsync(business);
                    // await delightFinanceContext.SaveChangesAsync();
                    return Ok(business);
                }
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
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

        [HttpDelete("business/{id}")]
        public IActionResult DeleteBusiness(Guid id)
        {
            // Logic: Soft delete for CurrentUserId
            return Ok(new { Message = "Profile deleted", Email = CurrentUserEmail });
        }

        // TRANSACTIONS
        [HttpGet("business/{businessId}/transactions")]
        public async Task<IActionResult> GetTransactionsAsync(Guid businessId, [FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
        {
            try
            {
                return Ok(new List<TransactionEntity>());
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("business/{businessId}/transactions/paged")]
        public async Task<IActionResult> GetTransactionsPagedAsync(
            Guid businessId, 
            [FromQuery] DateTime? startDate, 
            [FromQuery] DateTime? endDate,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? searchText = null)
        {
            try
            {
                // Note: Pagination logic for Entity Framework Core
                // var query = context.Transactions.Where(t => t.BusinessId == businessId && t.UserId == CurrentUserId);
                // if (startDate.HasValue) query = query.Where(t => t.Date >= startDate.Value);
                // if (endDate.HasValue) query = query.Where(t => t.Date <= endDate.Value);
                // if (!string.IsNullOrEmpty(searchText)) query = query.Where(t => t.Description.Contains(searchText) || (t.Notes != null && t.Notes.Contains(searchText)));
                // int totalCount = await query.CountAsync();
                // var items = await query.OrderByDescending(t => t.Date).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
                
                return Ok(new { TotalCount = 0, Page = page, PageSize = pageSize, Items = new List<TransactionEntity>() });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("transaction")]
        public async Task<IActionResult> CreateTransactionAsync([FromBody] SaveTransactionRequestDto request)
        {
            try
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
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPut("transaction/{id}")]
        public async Task<IActionResult> UpdateTransactionAsync(Guid id, [FromBody] SaveTransactionRequestDto request)
        {
            try
            {
                var transaction = new TransactionEntity
                {
                    Id = id,
                    Amount = request.Amount,
                    Deductions = request.Deductions,
                    FinalAmount = request.FinalAmount,
                    CategoryId = request.CategoryId,
                    Description = request.Description,
                    Date = request.Date,
                    Notes = request.Notes,
                    BusinessId = request.BusinessId,
                    UserId = CurrentUserId,
                    UpdatedAt = DateTime.UtcNow
                };

                return Ok(transaction);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // BUDGETS & CATEGORIES
        [HttpGet("categories/{businessId}")]
        public IActionResult GetBusinessCategories(Guid businessId)
        {
            return Ok(new List<CategoryEntity>());
        }

        [HttpPost("category/{businessId}")]
        public IActionResult SaveCategory(Guid businessId, [FromBody] CategoryEntity category)
        {
            if (category.Id == Guid.Empty)
            {
                category.Id = Guid.NewGuid();
            }
            
            category.BusinessId = businessId;
            category.UserId = CurrentUserId;
            return Ok(category);
        }

        [HttpDelete("category/{id}")]
        public IActionResult DeleteCategory(Guid id)
        {
            return Ok(new { success = true });
        }

        // RULES
        [HttpGet("business/{businessId}/rules")]
        public IActionResult GetBusinessRules(Guid businessId)
        {
            return Ok(new List<ImportRuleEntity>());
        }

        [HttpPost("rule")]
        public IActionResult SaveImportRule([FromBody] ImportRuleEntity rule)
        {
            rule.Id = Guid.NewGuid();
            rule.UserId = CurrentUserId;
            return Ok(rule);
        }
    }
}
