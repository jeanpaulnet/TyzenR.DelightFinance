-- SQL Migration script for Transaction Table
-- Based on updated C# Entity definition with UserId as UNIQUEIDENTIFIER

CREATE TABLE [Transaction] (
    [Id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [Amount] DECIMAL(18, 2) NOT NULL,
    [Deductions] DECIMAL(18, 2) NOT NULL DEFAULT 0,
    [FinalAmount] DECIMAL(18, 2) NOT NULL,
    [CategoryId] UNIQUEIDENTIFIER NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    [Description] NVARCHAR(MAX) NOT NULL DEFAULT '',
    [Date] DATETIME2 NOT NULL,
    [Notes] NVARCHAR(MAX),
    [BusinessId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IX_Transaction_BusinessId ON [Transaction] ([BusinessId]);
CREATE INDEX IX_Transaction_CategoryId ON [Transaction] ([CategoryId]);
CREATE INDEX IX_Transaction_UserId ON [Transaction] ([UserId]);
CREATE INDEX IX_Transaction_Date ON [Transaction] ([Date]);
